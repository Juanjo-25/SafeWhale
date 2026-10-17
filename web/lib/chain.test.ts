import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ganache from 'ganache';
import { Contract, ContractFactory, JsonRpcProvider, Transaction, formatEther, parseEther } from 'ethers';
import artifact from '../../contracts/DowntimeCover (1).json';
import { demoConstructorArgs } from '../../shared/config';
import type { Address } from '../../shared/types';
import { parseEnvironment } from './env-schema';
import { withChainStore } from './chain-store';
import { runMonitorOnce } from './monitor-engine';
import { readChainState } from './chain';
import { POST as buy } from '../../api/app/api/comprar/route';
import { POST as drop } from '../../api/app/api/tumbar/route';
import { POST as control } from '../../api/app/api/apagar-agente/route';
import { POST as claim } from '../../api/app/api/reclamar/route';
import { POST as attack } from '../../api/app/api/atacar/route';
import { POST as storm } from '../../api/app/api/tormenta/route';
import { GET as mock } from '../../api/app/api/exchange-mock/route';
import { GET as stateRoute } from '../../api/app/api/estado/route';
import { POST as login } from '../../api/app/api/demo-session/route';

const token = 'token-sintetico-para-pruebas-000000000';
function request(body: unknown, key = 'test-operation-0001', cookie?: string) {
  return new Request('http://localhost/api/demo', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': key,
    ...(cookie ? { Cookie: cookie, Origin: 'http://localhost' } : { Authorization: 'Bearer ' + token }),
  }, body: JSON.stringify(body) });
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'safewhale-chain-'));
  const server = ganache.server({ logging: { quiet: true }, chain: { hardfork: 'shanghai', chainId: 10143 }, miner: { timestampIncrement: 0 } });
  await server.listen(0, '127.0.0.1');
  const port = (server.address() as { port: number }).port;
  const provider = new JsonRpcProvider('http://127.0.0.1:' + port, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
  const [owner, agent, user] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
  const deployed = await new ContractFactory(artifact.abi, artifact.data.bytecode.object, owner).deploy(...demoConstructorArgs(await agent.getAddress() as Address));
  const receipt = await deployed.deploymentTransaction()!.wait();
  const c = new Contract(await deployed.getAddress(), artifact.abi, owner);
  await (await c.fund({ value: parseEther('1') })).wait();
  await (await c.connect(agent).getFunction('stakeBond')({ value: parseEther('0.5') })).wait();
  const accounts = server.provider.getInitialAccounts();
  const env = parseEnvironment({ BACKEND_MODE: 'testnet', MONAD_RPC_URL: 'http://127.0.0.1:' + port,
    CONTRACT_ADDRESS: await c.getAddress(), CONTRACT_DEPLOY_BLOCK: receipt!.blockNumber,
    AGENT_PRIVATE_KEY: accounts[(await agent.getAddress()).toLowerCase()].secretKey,
    DEMO_USER_PRIVATE_KEY: accounts[(await user.getAddress()).toLowerCase()].secretKey,
    STATE_FILE: join(directory, 'state.json'), DEMO_API_TOKEN: token, TX_WAIT_MS: 1000 });
  const previous = process.env;
  process.env = { NODE_ENV: 'test', ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) };
  t.after(async () => { process.env = previous; provider.destroy(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const at = async (seconds: number) => { await server.provider.request({ method: 'evm_setTime', params: [seconds * 1000] }); await server.provider.request({ method: 'evm_mine', params: [] }); };
  const fetcher = (async (url: RequestInfo | URL) => mock(new Request(String(url)))) as typeof fetch;
  const outage = async (paused = false) => {
    if (paused) assert.equal((await control(request({ activo: false }, 'pause-agent-0001'))).status, 200);
    const response = await drop(request({ servicioId: 1 }, 'drop-service-0001')); assert.equal(response.status, 200);
    const now = Math.floor(Date.now() / 1000);
    await runMonitorOnce(env, fetcher, now);
    await at(now + 10);
    const result = await runMonitorOnce(env, fetcher, now + 10); assert.equal(result.reported, 1);
    return now;
  };
  return { env, c, provider, server, at, fetcher, outage, user, directory };
}

test('API testnet compra realmente, conserva idempotencia concurrente y publica solo hashes confirmados', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([buy(request({ servicioId: 1, horas: 4 })), buy(request({ servicioId: 1, horas: 4 }))]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
  const [one, two] = await Promise.all(results.map((r) => r.json())); assert.deepEqual(one, two);
  assert.match(one.txHash, /^0x[\da-f]{64}$/); assert.equal(one.poliza.dueno, await f.user.getAddress());
  assert.equal(await f.c.totalPolizas(), 1n);
  assert.equal((await buy(request({ servicioId: 1, horas: 2 }))).status, 409);
  const state = await (await stateRoute(new Request('http://localhost/api/estado'))).json();
  assert.equal(state.modo, 'testnet'); assert.equal(state.fondo, '1.004'); assert.equal(state.autorizado, false);
  assert.ok(state.eventos.some((e: { txHash: string }) => e.txHash === one.txHash));
  const serialized = JSON.stringify(state);
  for (const secret of [f.env.AGENT_PRIVATE_KEY!, f.env.DEMO_USER_PRIVATE_KEY!, token]) assert.ok(!serialized.includes(secret));
});

test('intento inválido usa eth_call y no consume nonce ni presenta un hash ficticio', async (t) => {
  const f = await fixture(t); await buy(request({ servicioId: 1, horas: 1 }));
  const before = await f.provider.getTransactionCount(await f.c.agent());
  const response = await attack(request({ polizaId: '1' }, 'attack-policy-0001'));
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.rechazado, true); assert.equal(result.motivo, 'SinCaida'); assert.equal(result.txHash, null);
  assert.equal(await f.provider.getTransactionCount(await f.c.agent()), before);
  assert.equal((await buy(request({ servicioId: 2, horas: 1 }, 'wrong-service-0001'))).status, 409);
});

test('monitor exige continuidad, reporta una vez y paga sin duplicar después de reiniciar', async (t) => {
  const f = await fixture(t); await buy(request({ servicioId: 1, horas: 1 }));
  const start = await f.outage(); assert.equal((await f.c.getPolicy(1)).estado, 0n);
  const result = await runMonitorOnce(f.env, f.fetcher, start + 12); assert.equal(result.paid, 1);
  assert.equal((await f.c.getPolicy(1)).estado, 1n);
  assert.equal(formatEther(await f.c.fundBalance()), '0.991'); assert.equal(formatEther(await f.c.bondBalance()), '0.5');
  const nonce = await f.provider.getTransactionCount(await f.c.agent());
  assert.equal((await runMonitorOnce(f.env, f.fetcher, start + 14)).paid, 0);
  assert.equal(await f.provider.getTransactionCount(await f.c.agent()), nonce);
});

test('pagos apagados conservan reportes; el usuario cobra del bono después de la espera', async (t) => {
  const f = await fixture(t); await buy(request({ servicioId: 1, horas: 1 })); const start = await f.outage(true);
  assert.equal((await runMonitorOnce(f.env, f.fetcher, start + 12)).paid, 0);
  assert.equal((await claim(request({ polizaId: '1' }, 'claim-too-early-0001'))).status, 409);
  await f.at(start + 40);
  const response = await claim(request({ polizaId: '1' }, 'claim-policy-0001')); assert.equal(response.status, 200);
  assert.match((await response.json()).txHash, /^0x[\da-f]{64}$/);
  assert.equal(formatEther(await f.c.fundBalance()), '1.001'); assert.equal(formatEther(await f.c.bondBalance()), '0.49');
  assert.equal((await claim(request({ polizaId: '1' }, 'claim-double-0001'))).status, 409);
});

test('un timeout del mock reinicia la observación y no se convierte en una caída probada', async (t) => {
  const f = await fixture(t); await buy(request({ servicioId: 1, horas: 1 }));
  await drop(request({ servicioId: 1 }, 'drop-service-0001')); const now = Math.floor(Date.now() / 1000);
  await runMonitorOnce(f.env, f.fetcher, now);
  await runMonitorOnce(f.env, (async () => { throw new Error('timeout'); }) as typeof fetch, now + 8);
  await f.at(now + 12); assert.equal((await runMonitorOnce(f.env, f.fetcher, now + 12)).reported, 0);
  assert.equal((await f.c.getOutage(1)).id, 0n);
});

test('journal recupera un receipt después de perder la respuesta sin crear otra compra', async (t) => {
  const f = await fixture(t); const first = await (await buy(request({ servicioId: 1, horas: 4 }))).json();
  const tx = await f.provider.getTransaction(first.txHash); assert.ok(tx);
  const raw = Transaction.from({ type: tx.type, to: tx.to, data: tx.data, value: tx.value, nonce: tx.nonce, gasLimit: tx.gasLimit,
    gasPrice: tx.type === 0 ? tx.gasPrice : undefined, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas, chainId: tx.chainId, signature: tx.signature }).serialized;
  await withChainStore(f.env, async (state, save) => { const op = state.operations['test-operation-0001']; op.status = 'prepared'; op.raw = raw; delete op.result; await save(); });
  const replay = await buy(request({ servicioId: 1, horas: 4 })); assert.equal(replay.status, 201);
  assert.equal((await replay.json()).txHash, first.txHash); assert.equal(await f.c.totalPolizas(), 1n);
});

test('transacción aún no minada conserva hash y bloquea un segundo nonce hasta reconciliar', async (t) => {
  const f = await fixture(t); await f.server.provider.request({ method: 'miner_stop', params: [] });
  const pending = await buy(request({ servicioId: 1, horas: 1 })); assert.equal(pending.status, 503);
  const body = await pending.json(); assert.equal(body.error.codigo, 'TRANSACTION_PENDING'); assert.match(body.txHash, /^0x[\da-f]{64}$/);
  const blocked = await buy(request({ servicioId: 1, horas: 1 }, 'second-buy-0001')); assert.equal(blocked.status, 503);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.txHash, body.txHash);
  const journal = JSON.parse(await readFile(f.env.STATE_FILE + '.chain.json', 'utf8'));
  assert.deepEqual(Object.keys(journal.operations), ['test-operation-0001']);
  await f.server.provider.request({ method: 'miner_start', params: [1] });
  const replay = await buy(request({ servicioId: 1, horas: 1 })); assert.equal(replay.status, 201);
  assert.equal((await replay.json()).txHash, body.txHash); assert.equal(await f.c.totalPolizas(), 1n);
});

test('sesión HttpOnly autoriza el navegador y rechaza cookies manipuladas o de otro origen', async (t) => {
  const f = await fixture(t);
  const unauthorized = new Request('http://localhost/api/comprar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'browser-buy-0001' }, body: JSON.stringify({ servicioId: 1, horas: 1 }) });
  assert.equal((await buy(unauthorized)).status, 401);
  const response = await login(new Request('http://localhost/api/demo-session', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }));
  assert.equal(response.status, 200); const setCookie = response.headers.get('set-cookie')!; assert.match(setCookie, /HttpOnly; SameSite=Strict/);
  assert.ok(!setCookie.includes(token)); const cookie = setCookie.split(';')[0];
  assert.equal((await buy(request({ servicioId: 1, horas: 1 }, 'browser-buy-0001', cookie))).status, 201);
  const cross = request({ servicioId: 1, horas: 1 }, 'cross-buy-0001', cookie); cross.headers.set('origin', 'https://otro.example');
  assert.equal((await buy(cross)).status, 403);
  const state = await readChainState(f.env); assert.equal(state.polizas.length, 1);
  assert.ok(!(await readFile(f.env.STATE_FILE + '.chain.json', 'utf8')).includes(f.env.AGENT_PRIVATE_KEY!));
});

test('tormenta confirma cada resultado, conserva fallos parciales y rechaza reutilizar la clave con otros IDs', async (t) => {
  const f = await fixture(t); await buy(request({ servicioId: 1, horas: 1 })); await f.outage(true);
  await control(request({ activo: true }, 'resume-storm-0001'));
  const input = { polizaIds: ['1', '999'] };
  const response = await storm(request(input, 'storm-operation-0001')); assert.equal(response.status, 200);
  const first = await response.json(); assert.equal(first.resultados.length, 2);
  assert.equal(first.resultados[0].ok, true); assert.match(first.resultados[0].txHash, /^0x[\da-f]{64}$/);
  assert.equal(first.resultados[1].ok, false); assert.equal(first.resultados[1].motivo, 'PolizaInvalida');
  assert.deepEqual(await (await storm(request(input, 'storm-operation-0001'))).json(), first);
  assert.equal((await storm(request({ polizaIds: ['1'] }, 'storm-operation-0001'))).status, 409);
  assert.equal((await storm(request({ polizaIds: ['1', '1'] }, 'storm-duplicate-0001'))).status, 400);
  assert.equal((await f.c.getOutage(1)).pagosRealizados, 1n);
});
