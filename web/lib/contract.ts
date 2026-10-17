import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { formatEther, parseEther, Wallet } from "ethers";
import { z } from "zod";
import { ApiError, type MutationOutcome } from "./api";
import type { BackendEnvironment } from "./env-schema";
import { updateSimulationSnapshot, type SimulationMutationResult, type SimulationSnapshot } from "./state";
import { serviceIdSchema } from './services';
import { CONTRACT_LIMITS, DEMO_CONTRACT_PARAMETERS } from '../../shared/config';
import type { ParametrosJSON, PolizaJSON } from '../../shared/types';

const simulation = { pricePerHour: DEMO_CONTRACT_PARAMETERS.precioHora,
  payout: formatEther(DEMO_CONTRACT_PARAMETERS.indemnizacion),
  maxActivePolicies: CONTRACT_LIMITS.maxPolizasConReserva };
const simulatedOwner = "0x0000000000000000000000000000000000000001";

export function simulationParameters(): ParametrosJSON {
  return { precioHora: formatEther(simulation.pricePerHour), indemnizacion: simulation.payout,
    umbralSeg: Number(DEMO_CONTRACT_PARAMETERS.umbralSegundos),
    tiempoReclamoSeg: Number(DEMO_CONTRACT_PARAMETERS.tiempoReclamo),
    topePorEvento: Number(DEMO_CONTRACT_PARAMETERS.topePorEvento),
    maxHoras: Number(DEMO_CONTRACT_PARAMETERS.maxHoras) };
}

export function demoUserAddress(env: BackendEnvironment) {
  return env.DEMO_USER_PRIVATE_KEY ? new Wallet(env.DEMO_USER_PRIVATE_KEY).address : simulatedOwner;
}

export const purchaseSchema = z.object({ servicioId: serviceIdSchema,
  horas: z.number().int().min(1).max(Number(DEMO_CONTRACT_PARAMETERS.maxHoras)) }).strict();
export const serviceSchema = z.object({ servicioId: serviceIdSchema }).strict();
export const emptySchema = z.object({}).strict();

export function quoteSimulationCover(input: z.infer<typeof purchaseSchema>) {
  const validated = purchaseSchema.parse(input);
  return {
    servicioId: validated.servicioId,
    horas: validated.horas,
    prima: formatEther(simulation.pricePerHour * BigInt(validated.horas)),
    pagoFijo: simulation.payout,
    moneda: "MON" as const,
    requiereConfirmacion: true as const,
  };
}

export function assertSimulationPurchaseAvailable(snapshot: SimulationSnapshot, now = Math.floor(Date.now() / 1000), servicioId: 1 | 2 = 1) {
  if (snapshot.servicios[servicioId].caido) throw new ApiError("EXCHANGE_DOWN", "No se puede comprar cobertura durante la caída del servicio seleccionado.", 409);
  if (snapshot.caidas[String(servicioId) as '1' | '2']) throw new ApiError('CaidaYaReportada', 'Este servicio ya tuvo su único evento. Usa una instancia nueva.', 409);
  const reserved = simulationReserved(snapshot, now);
  if (reserved.length >= simulation.maxActivePolicies) throw new ApiError("POLICY_LIMIT", "Se alcanzó el máximo de 50 pólizas con reserva.", 409);
  if (parseEther(snapshot.bono) < DEMO_CONTRACT_PARAMETERS.stakeMinimo) throw new ApiError('BonoInsuficiente', 'El bono está por debajo del mínimo garantizado.', 409);
}

function event(snapshot: SimulationSnapshot, tipo: string, now: number, polizaId: string | null = null, servicioId?: 1 | 2) {
  snapshot.eventos.push({ id: `evt-${randomUUID()}`, tipo, polizaId, servicioId, txHash: null, timestamp: now, ok: true, motivo: null, origen: "simulado" });
}

async function mutate(
  env: BackendEnvironment, key: string, operation: string, input: unknown, status: 200 | 201,
  execute: (snapshot: SimulationSnapshot, now: number) => Omit<SimulationMutationResult, "ok" | "modo" | "txHash" | "duracionMs">,
): Promise<MutationOutcome> {
  if (env.BACKEND_MODE !== "simulado") throw new ApiError("TESTNET_PENDING", "Esta operación solo implementa la simulación local.", 503);
  const started = performance.now();
  const fingerprint = createHash("sha256").update(JSON.stringify({ operation, input })).digest("hex");
  return updateSimulationSnapshot(env.STATE_FILE, (snapshot) => {
    const existing = snapshot.idempotencia.find((record) => record.key === key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ApiError("IDEMPOTENCY_CONFLICT", "Esta Idempotency-Key ya se usó para otra operación o datos.", 409);
      return { status: existing.status, resultado: existing.resultado, replayed: true };
    }
    const fields = execute(snapshot, Math.floor(Date.now() / 1000));
    const resultado: SimulationMutationResult = {
      ok: true, modo: "simulado", txHash: null,
      duracionMs: Math.round((performance.now() - started) * 100) / 100,
      ...fields,
    };
    snapshot.idempotencia.push({ key, fingerprint, status, resultado });
    return { status, resultado, replayed: false };
  }, env);
}

export async function buySimulationCover(env: BackendEnvironment, key: string, input: z.infer<typeof purchaseSchema>) {
  const owner = demoUserAddress(env);
  return mutate(env, key, "comprar", { ...input, dueno: owner }, 201, (snapshot, now) => {
    assertSimulationPurchaseAvailable(snapshot, now, input.servicioId);
    const quote = quoteSimulationCover(input);
    const nextId = snapshot.polizas.reduce((max, policy) => BigInt(policy.id) > max ? BigInt(policy.id) : max, 0n) + 1n;
    const premium = parseEther(quote.prima);
    const exposure = BigInt(simulationReserved(snapshot, now).length + 1) * DEMO_CONTRACT_PARAMETERS.indemnizacion;
    if (parseEther(snapshot.fondo) + premium < exposure) throw new ApiError('FondoInsuficiente', 'El fondo no puede respaldar otra póliza.', 409);
    const policy: PolizaJSON = { id: nextId.toString(), dueno: owner, servicioId: input.servicioId, inicio: now, fin: now + input.horas * 3600, estado: "Activa" };
    snapshot.polizas.push(policy);
    snapshot.fondo = formatEther(parseEther(snapshot.fondo) + premium);
    event(snapshot, "CoverComprada", now, policy.id, input.servicioId);
    return { poliza: policy, prima: quote.prima, pagoFijo: quote.pagoFijo };
  });
}

export async function dropSimulationExchange(env: BackendEnvironment, key: string, input: z.infer<typeof serviceSchema>) {
  return mutate(env, key, "tumbar", input, 200, (snapshot, now) => {
    const service = snapshot.servicios[input.servicioId];
    if (!service.caido) {
      service.caido = true;
      service.caidaIniciadaEn = now;
      if (input.servicioId === 1) { snapshot.exchangeCaido = true; snapshot.caidaIniciadaEn = now; }
      event(snapshot, "ServicioCaido", now, null, input.servicioId);
    }
    return { servicioId: input.servicioId, exchangeCaido: true, caidaDesde: service.caidaIniciadaEn };
  });
}

export async function restoreSimulationService(env: BackendEnvironment, key: string, input: z.infer<typeof serviceSchema>) {
  return mutate(env, key, "restaurar", input, 200, (snapshot, now) => {
    const service = snapshot.servicios[input.servicioId];
    if (service.caido) {
      service.caido = false;
      service.caidaIniciadaEn = null;
      if (input.servicioId === 1) { snapshot.exchangeCaido = false; snapshot.caidaIniciadaEn = null; }
      event(snapshot, "ServicioRestaurado", now, null, input.servicioId);
    }
    return { servicioId: input.servicioId, exchangeCaido: false, caidaDesde: null };
  });
}

export async function stopSimulationPayouts(env: BackendEnvironment, key: string, activo = false) {
  return mutate(env, key, "apagar-agente", { activo }, 200, (snapshot, now) => {
    if (snapshot.agenteActivo !== activo) {
      snapshot.agenteActivo = activo;
      event(snapshot, activo ? 'AgenteEncendido' : 'AgenteApagado', now);
    }
    return { agenteActivo: activo };
  });
}

export const policyIdSchema = z.object({ polizaId: z.string().regex(/^[1-9]\d*$/).max(78) }).strict();
export const stormSchema = z.object({ polizaIds: z.array(z.string().regex(/^[1-9]\d*$/).max(78)).min(1).max(30)
  .refine((ids) => new Set(ids).size === ids.length) }).strict();
export const agentControlSchema = z.object({ activo: z.boolean().optional() }).strict();

export function simulationPayable(snapshot: SimulationSnapshot, policyId: string) {
  const policy = snapshot.polizas.find((p) => p.id === policyId);
  if (!policy) throw new ApiError('PolizaInvalida', 'La póliza no existe.', 409);
  if (policy.estado === 'Pagada') throw new ApiError('YaPagada', 'La póliza ya fue pagada.', 409);
  const outage = snapshot.caidas[String(policy.servicioId) as '1' | '2'];
  if (!outage) throw new ApiError('SinCaida', 'No existe una caída reportada.', 409);
  if (!(policy.inicio <= outage.inicio && outage.inicio < policy.fin)) throw new ApiError('FueraDeVentana', 'La caída no comenzó dentro de la cobertura.', 409);
  if (outage.pagosRealizados >= Number(DEMO_CONTRACT_PARAMETERS.topePorEvento)) throw new ApiError('TopeEvento', 'Se agotó el tope del evento.', 409);
  return { policy, outage };
}
export function simulationReserved(snapshot: SimulationSnapshot, now: number) {
  return snapshot.polizas.filter((policy) => {
    if (policy.estado === 'Pagada') return false;
    if (policy.fin > now) return true;
    const outage = snapshot.caidas[String(policy.servicioId) as '1' | '2'];
    if (!outage) return now - policy.fin < Number(DEMO_CONTRACT_PARAMETERS.plazoReporte);
    try { simulationPayable(snapshot, policy.id); return true; } catch { return false; }
  });
}
function paySimulation(snapshot: SimulationSnapshot, polizaId: string, now: number, via: 'fondo' | 'bono', owner?: string) {
  const { policy, outage } = simulationPayable(snapshot, polizaId);
  if (via === 'bono') {
    if (owner?.toLowerCase() !== policy.dueno.toLowerCase()) throw new ApiError('NoEsDueno', 'La cuenta de demo no es dueña de la póliza.', 409);
    if (now - outage.reportadoEn < Number(DEMO_CONTRACT_PARAMETERS.tiempoReclamo)) throw new ApiError('EsperaPendiente', 'Todavía no vence la espera del reclamo.', 409);
  }
  const account = via === 'bono' ? 'bono' : 'fondo';
  if (parseEther(snapshot[account]) < DEMO_CONTRACT_PARAMETERS.indemnizacion) throw new ApiError(via === 'bono' ? 'BonoInsuficiente' : 'FondoInsuficiente', 'Saldo insuficiente para pagar.', 409);
  snapshot[account] = formatEther(parseEther(snapshot[account]) - DEMO_CONTRACT_PARAMETERS.indemnizacion);
  policy.estado = 'Pagada'; outage.pagosRealizados++;
  event(snapshot, via === 'bono' ? 'Reclamado' : 'Pagado', now, policy.id, policy.servicioId as 1 | 2);
}
export function claimSimulationCover(env: BackendEnvironment, key: string, input: { polizaId: string }) {
  return mutate(env, key, 'reclamar', input, 200, (snapshot, now) => {
    paySimulation(snapshot, input.polizaId, now, 'bono', demoUserAddress(env)); return {};
  });
}
export function attackSimulationCover(env: BackendEnvironment, key: string, input: { polizaId: string }) {
  return mutate(env, key, 'atacar', input, 200, (snapshot, now) => {
    let reason = '';
    try { simulationPayable(snapshot, input.polizaId); }
    catch (error) { if (!(error instanceof ApiError)) throw error; reason = error.codigo; }
    if (!reason) throw new ApiError('ATTACK_NOT_INVALID', 'La póliza sí puede pagarse; elige una sin caída.', 409);
    snapshot.eventos.push({ id: `evt-${randomUUID()}`, tipo: 'Revertido', polizaId: input.polizaId, txHash: null, timestamp: now, ok: false, motivo: reason, origen: 'simulado' });
    return { rechazado: true, motivo: reason };
  });
}
export function stormSimulation(env: BackendEnvironment, key: string, input: { polizaIds: string[] }) {
  return mutate(env, key, 'tormenta', input, 200, (snapshot, now) => {
    if (!snapshot.agenteActivo) throw new ApiError('AGENT_DISABLED', 'Los pagos del agente están desactivados.', 409);
    const resultados = input.polizaIds.map((polizaId) => {
      try { paySimulation(snapshot, polizaId, now, 'fondo'); return { polizaId, ok: true, txHash: null, motivo: null }; }
      catch (error) { if (!(error instanceof ApiError)) throw error; return { polizaId, ok: false, txHash: null, motivo: error.codigo }; }
    });
    return { resultados };
  });
}

export function applySimulationMonitor(env: BackendEnvironment, observations: import('./monitor-engine').Observation[], now: number) {
  return updateSimulationSnapshot(env.STATE_FILE, (snapshot) => {
    let reported = 0; let paid = 0; const errors: string[] = [];
    for (const observed of observations) {
      const id = observed.servicioId;
      if (!snapshot.caidas[String(id) as '1' | '2'] && observed.inicio !== null && observed.observadoDesde !== null && !observed.error &&
          observed.muestras >= 2 && now - observed.observadoDesde >= Number(DEMO_CONTRACT_PARAMETERS.umbralSegundos)) {
        if (now - observed.inicio > Number(DEMO_CONTRACT_PARAMETERS.plazoReporte)) { errors.push('ReporteFueraDePlazo'); continue; }
        snapshot.caidas[String(id) as '1' | '2'] = { id: String(Object.keys(snapshot.caidas).length + 1), inicio: observed.inicio,
          reportadoEn: now, duracionSegundos: now - observed.inicio, evidenciaHash: createHash('sha256').update(JSON.stringify(observed)).digest('hex'), pagosRealizados: 0 };
        event(snapshot, 'CaidaReportada', now, null, id); reported++; continue;
      }
      if (!snapshot.agenteActivo) continue;
      for (const policy of snapshot.polizas.filter((p) => p.servicioId === id && p.estado !== 'Pagada')) {
        try { paySimulation(snapshot, policy.id, now, 'fondo'); paid++; }
        catch (error) { if (!(error instanceof ApiError)) throw error;
          if (!['SinCaida', 'FueraDeVentana', 'TopeEvento'].includes(error.codigo)) errors.push(error.codigo); }
      }
    }
    return { reported, paid, errors };
  }, env);
}
