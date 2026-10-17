import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvironment } from './env-schema';
import { buySimulationCover, claimSimulationCover, dropSimulationExchange } from './contract';
import { readSimulationSnapshot, updateSimulationSnapshot } from './state';
import { runMonitorOnce } from './monitor-engine';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'safewhale-monitor-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const env = parseEnvironment({ STATE_FILE: join(directory, 'state.json') }); await buySimulationCover(env, 'test-buy-0001', { servicioId: 1, horas: 1 });
  return env;
}
test('monitor local reporta después del umbral, paga en el siguiente ciclo y conserva el bono', async (t) => {
  const env = await fixture(t), now = Math.floor(Date.now() / 1000);
  const fetcher = (async (url: RequestInfo | URL) => {
    const id = Number(new URL(String(url)).searchParams.get('servicioId'));
    return Response.json({ modo: 'simulado', servicioId: id, disponible: id !== 1, caidaDesde: id === 1 ? now : null }, { status: id === 1 ? 503 : 200 });
  }) as typeof fetch;
  assert.equal((await runMonitorOnce(env, fetcher, now)).reported, 0);
  assert.equal((await runMonitorOnce(env, fetcher, now + 9)).reported, 0);
  const report = await runMonitorOnce(env, fetcher, now + 10); assert.equal(report.reported, 1); assert.equal(report.paid, 0);
  assert.equal((await runMonitorOnce(env, fetcher, now + 12)).paid, 1);
  assert.equal((await runMonitorOnce(env, fetcher, now + 14)).paid, 0);
  const snapshot = await readSimulationSnapshot(env.STATE_FILE);
  assert.equal(snapshot.polizas[0].estado, 'Pagada'); assert.equal(snapshot.fondo, '0.991'); assert.equal(snapshot.bono, '0.500');
  assert.ok(snapshot.eventos.every((e) => e.txHash === null));
});

test('reclamo simulado conserva el derecho después del vencimiento y no consume el fondo', async (t) => {
  const env = await fixture(t), now = Math.floor(Date.now() / 1000);
  await updateSimulationSnapshot(env.STATE_FILE, (state) => {
    state.polizas[0].inicio = now - 100; state.polizas[0].fin = now - 1;
    state.caidas['1'] = { id: '1', inicio: now - 60, reportadoEn: now - 31, duracionSegundos: 10, evidenciaHash: 'evidencia-simulada', pagosRealizados: 0 };
  });
  const result = await claimSimulationCover(env, 'test-claim-0001', { polizaId: '1' }); assert.equal(result.status, 200);
  const snapshot = await readSimulationSnapshot(env.STATE_FILE);
  assert.equal(snapshot.polizas[0].estado, 'Pagada'); assert.equal(snapshot.fondo, '1.001'); assert.equal(snapshot.bono, '0.49');
  await assert.rejects(claimSimulationCover(env, 'test-double-0001', { polizaId: '1' }), /ya fue pagada/);
});

test('monitor cloud observa el mismo mock del estado sin depender de localhost ni de HTTP público', async (t) => {
  const env = await fixture(t), now = Math.floor(Date.now() / 1000);
  env.MONITOR_SOURCE = 'store';
  env.APP_BASE_URL = 'https://dominio-que-no-se-consulta.example';
  await dropSimulationExchange(env, 'drop-store-test-001', { servicioId: 1 });
  const noHttp = (async () => { throw new Error('No debe consultar la red'); }) as typeof fetch;
  assert.equal((await runMonitorOnce(env, noHttp, now)).reported, 0);
  assert.equal((await runMonitorOnce(env, noHttp, now + 10)).reported, 1);
  assert.equal((await runMonitorOnce(env, noHttp, now + 12)).paid, 1);
  assert.equal((await readSimulationSnapshot(env.STATE_FILE)).polizas[0].estado, 'Pagada');
});
