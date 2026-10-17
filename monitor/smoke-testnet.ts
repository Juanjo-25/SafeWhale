import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import { loadBackendEnvironment } from './load-env.ts';

const { env } = loadBackendEnvironment();
if (env.BACKEND_MODE !== 'testnet') throw new Error('Este ensayo requiere BACKEND_MODE=testnet.');
const headers = { Authorization: 'Bearer ' + env.DEMO_API_TOKEN, Origin: env.APP_BASE_URL, 'Content-Type': 'application/json' };
const report: Record<string, unknown> = { contrato: env.CONTRACT_ADDRESS, chainId: env.MONAD_CHAIN_ID, started: new Date().toISOString() };
async function state() {
  const response = await fetch(env.APP_BASE_URL + '/api/estado', { headers, signal: AbortSignal.timeout(60000) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error?.codigo ?? 'STATE_UNAVAILABLE'); return body;
}
async function post(path: string, body: unknown, key: string) {
  const response = await fetch(env.APP_BASE_URL + '/api/' + path, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'smoke:' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error?.codigo ?? 'REQUEST_FAILED'); return data;
}
try {
  let current = await state(); if (current.caida) throw new Error('Esta instancia ya consumió su único evento. Usa una nueva para este ensayo.');
  const policies = current.polizas.filter((p: { dueno: string; estado: string }) => p.dueno.toLowerCase() === current.cuentaDemo.toLowerCase() && p.estado === 'Activa');
  while (policies.length < 2) { const result = await post('comprar', { servicioId: 1, horas: 4 }, 'buy:' + policies.length); policies.push(result.poliza); console.log('Compra confirmada: ' + result.txHash); }
  report.polizas = policies.slice(0, 2).map((p: { id: string }) => p.id);
  report.ataque = await post('atacar', { polizaId: policies[0].id }, 'attack');
  await post('apagar-agente', { activo: false }, 'pause');
  await post('tumbar', { servicioId: 1 }, 'drop');
  const deadline = Date.now() + 120000;
  do { await delay(2000); current = await state(); if (current.caida) break; } while (Date.now() < deadline);
  if (!current.caida) throw new Error('El monitor no reportó la caída dentro del plazo.');
  report.caida = current.caida; console.log('Caída reportada: ' + current.caida.id);
  while (Math.floor(Date.now() / 1000) < current.caida.reportadoEn + current.parametros.tiempoReclamoSeg + 1) await delay(1000);
  report.reclamo = await post('reclamar', { polizaId: policies[1].id }, 'claim');
  console.log('Reclamo confirmado: ' + (report.reclamo as { txHash: string }).txHash);
  await post('apagar-agente', { activo: true }, 'resume');
  const payoutDeadline = Date.now() + 90000;
  do { await delay(2000); current = await state(); if (current.polizas.find((p: { id: string }) => p.id === policies[0].id)?.estado === 'Pagada') break; } while (Date.now() < payoutDeadline);
  if (current.polizas.find((p: { id: string }) => p.id === policies[0].id)?.estado !== 'Pagada') throw new Error('El monitor no confirmó el payout.');
  report.eventos = current.eventos.filter((e: { tipo: string; polizaId: string }) => ['CoverComprada', 'CaidaReportada', 'Pagado', 'Reclamado'].includes(e.tipo));
  report.saldosFinales = { fondo: current.fondo, bono: current.bono, exposicionTotal: current.exposicionTotal };
  await post('restaurar', { servicioId: 1 }, 'restore');
  report.ok = true; report.finished = new Date().toISOString();
  await writeFile(new URL('../contracts/testnet-evidence.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo terminar el ensayo testnet.'); process.exitCode = 1;
}
