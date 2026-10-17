import 'server-only';
import { keccak256, toUtf8Bytes } from 'ethers';
import { z } from 'zod';
import { withStateStore } from './store';
import { usingChain, chainPolicies, executeChainTransaction, chainError } from './chain';
import { applySimulationMonitor } from './contract';
import type { BackendEnvironment } from './env-schema';
import { readExchangeAvailability } from './exchange-state';

export interface Observation { servicioId: 1 | 2; inicio: number | null; observadoDesde: number | null; muestras: number; error: string | null }
const observation = z.object({ servicioId: z.union([z.literal(1), z.literal(2)]), inicio: z.number().nullable(), observadoDesde: z.number().nullable(), muestras: z.number(), error: z.string().nullable() });
export const monitorSchema = z.object({ identity: z.string(), observations: z.array(observation) });
const mockSchema = z.object({ modo: z.enum(['simulado', 'testnet']), servicioId: z.number(), disponible: z.boolean(), caidaDesde: z.number().int().nonnegative().nullable() });

export async function runMonitorOnce(env: BackendEnvironment, fetcher: typeof fetch = fetch, now = Math.floor(Date.now() / 1000)) {
  return withStateStore(env, 'monitor', env.STATE_FILE + '.monitor.json', () => ({ identity: env.CONTRACT_ADDRESS ?? 'simulado', observations: [] as Observation[] }),
    (value) => monitorSchema.parse(value), async (store, save) => {
      if (store.identity !== (env.CONTRACT_ADDRESS ?? 'simulado')) { store.identity = env.CONTRACT_ADDRESS ?? 'simulado'; store.observations = []; }
      const ids: (1 | 2)[] = env.BACKEND_MODE === 'testnet' ? [1] : [1, 2];
      for (const servicioId of ids) {
        let current = store.observations.find((o) => o.servicioId === servicioId);
        if (!current) { current = { servicioId, inicio: null, observadoDesde: null, muestras: 0, error: null }; store.observations.push(current); }
        try {
          let response: Response;
          if (env.MONITOR_SOURCE === 'store') {
            const availability = await readExchangeAvailability(env, servicioId);
            response = Response.json(availability.body, { status: availability.status });
          } else {
            const url = new URL('/api/exchange-mock', env.APP_BASE_URL); url.searchParams.set('servicioId', String(servicioId));
            response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(env.RPC_TIMEOUT_MS) });
          }
          const body = mockSchema.parse(await response.json());
          if (body.modo !== env.BACKEND_MODE || body.servicioId !== servicioId ||
              (response.status !== 200 && response.status !== 503) || body.disponible !== (response.status === 200)) throw new Error('invalid mock');
          if (body.disponible) { current.inicio = null; current.observadoDesde = null; current.muestras = 0; }
          else {
            const inicio = body.caidaDesde ?? now;
            if (inicio > now) throw new Error('future mock');
            if (current.inicio !== inicio || current.observadoDesde === null) { current.inicio = inicio; current.observadoDesde = now; current.muestras = 0; }
            current.muestras++;
          }
          current.error = null;
        } catch {
          // Un timeout o 500 no prueba una caída. Reinicia la continuidad observada.
          current.inicio = null; current.observadoDesde = null; current.muestras = 0; current.error = 'MOCK_UNAVAILABLE';
        }
      }
      await save();
      if (env.BACKEND_MODE === 'simulado') return applySimulationMonitor(env, store.observations, now);
      return monitorChain(env, store.observations[0], now);
    });
}
async function monitorChain(env: BackendEnvironment, observed: Observation, now: number) {
  let reported = 0; let paid = 0; const errors: string[] = [];
  const ids = await usingChain(env, async (ctx, state, save) => {
    state.monitor = { observadoDesde: observed.observadoDesde, inicioCaida: observed.inicio, muestras: observed.muestras, ultimaRevision: now, error: observed.error };
    await save();
    const outage = await ctx.contract.getOutage(1);
    if (outage.id === 0n && observed.inicio !== null && observed.observadoDesde !== null && !observed.error) {
      const threshold = Number(await ctx.contract.umbralSegundos());
      if (observed.muestras >= 2 && now - observed.observadoDesde >= threshold) {
        const hash = keccak256(toUtf8Bytes(JSON.stringify({ servicioId: 1, inicio: observed.inicio, umbral: threshold })));
        try {
          await executeChainTransaction(ctx, env, state, save, 'monitor:report:1:' + observed.inicio, 'report',
            { servicioId: 1, inicioCaida: observed.inicio, duracionSegundos: threshold, evidenciaHash: hash }, 'agent', () =>
              ctx.contract.connect(ctx.agent).getFunction('reportOutage').populateTransaction(1, observed.inicio, threshold, hash));
          reported++; return [];
        } catch (error) { state.monitor.error = chainError(error).codigo; await save(); throw error; }
      }
    }
    if (!state.controls.agenteActivo || outage.id === 0n) return [];
    return (await chainPolicies(ctx)).filter((p) => p.estado !== 'Pagada').map((p) => p.id);
  });
  for (const polizaId of ids) {
    try { const sent = await usingChain(env, async (ctx, state, save) => {
      if (!state.controls.agenteActivo || (await ctx.contract.caidaPagable(polizaId)) === 0n) return false;
      await executeChainTransaction(ctx, env, state, save, 'monitor:payout:' + polizaId, 'payout', { polizaId }, 'agent', () =>
        ctx.contract.connect(ctx.agent).getFunction('payout').populateTransaction(polizaId)); return true;
    }); if (sent) paid++; }
    catch (error) { errors.push(chainError(error).codigo); if (chainError(error).codigo === 'TRANSACTION_PENDING') break; }
  }
  return { reported, paid, errors };
}
