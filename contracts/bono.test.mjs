import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, MaxUint256, keccak256, parseEther, toUtf8Bytes } from 'ethers';
import { compileContract } from './compile.mjs';

// Ganache ejecuta Shanghai; el artefacto de entrega conserva el target del compilador original.
const compiled = compileContract('shanghai');
const payout = parseEther('0.01');
const premium = parseEther('0.001');
const evidence = keccak256(toUtf8Bytes('caida de prueba'));

async function fixture(t, { cap = 30, minimum = payout * BigInt(cap), bond = parseEther('0.5') } = {}) {
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' },
    miner: { timestampIncrement: 0 }, wallet: { totalAccounts: 4 } });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const [owner, agent, user] = await Promise.all([0, 1, 2].map((index) => provider.getSigner(index)));
  const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, owner);
  const args = [await agent.getAddress(), premium, payout, minimum, 0, 30, 10, cap, 24, 120];
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  const send = async (promise) => (await promise).wait();
  await send(c.fund({ value: parseEther('1') }));
  await send(c.connect(agent).stakeBond({ value: bond }));
  const buy = () => send(c.connect(user).buyCover(1, 1, { value: premium }));
  const at = async (seconds) => {
    await rpc.request({ method: 'evm_setTime', params: [seconds * 1000] });
    await rpc.request({ method: 'evm_mine', params: [] });
  };
  const report = async () => {
    const start = Number((await c.getPolicy(1)).inicio);
    await at(start + 10);
    await send(c.connect(agent).reportOutage(1, start, 10, evidence));
    await at(start + 40);
  };
  return { c, factory, args, provider, agent, user, send, buy, at, report };
}

async function rejectsWith(promise, name, contract) {
  await assert.rejects(promise, (error) => {
    const data = error.data ?? error.info?.error?.data?.result;
    assert.equal(contract.interface.parseError(data)?.name, name);
    return true;
  });
}

test('ABI y bytecode guardados corresponden al código actual', () => {
  const artifact = JSON.parse(readFileSync(new URL('./DowntimeCover (1).json', import.meta.url), 'utf8'));
  const current = compileContract();
  assert.deepEqual(artifact.abi, current.abi);
  const sharedAbi = JSON.parse(readFileSync(new URL('../shared/abi.json', import.meta.url), 'utf8'));
  assert.deepEqual(sharedAbi, current.abi);
  assert.deepEqual(artifact.data, current.evm);
});

test('rechaza un mínimo que no cubra el tope y acepta el mínimo exacto', async (t) => {
  const { c, factory, args, provider } = await fixture(t);
  assert.equal(await c.stakeMinimo(), parseEther('0.30'));
  assert.equal(await c.MAX_POLIZAS_CON_RESERVA(), 30n);
  for (const invalid of [payout, parseEther('0.30') - 1n]) {
    const invalidArgs = [...args]; invalidArgs[3] = invalid;
    await rejectsWith(provider.call(await factory.getDeployTransaction(...invalidArgs)), 'ParametrosInvalidos', c);
  }
  const overCapacityArgs = [...args]; overCapacityArgs[7] = 31n;
  await rejectsWith(provider.call(await factory.getDeployTransaction(...overCapacityArgs)), 'ParametrosInvalidos', c);
});

test('valida cero y montos extremos sin división por cero ni overflow', async (t) => {
  const { c, factory, args, provider } = await fixture(t);
  for (const indemnity of [0n, MaxUint256]) {
    const invalidArgs = [...args]; invalidArgs[2] = indemnity; invalidArgs[3] = MaxUint256;
    await rejectsWith(provider.call(await factory.getDeployTransaction(...invalidArgs)), 'ParametrosInvalidos', c);
  }
});

test('no vende cobertura antes de completar el bono mínimo', async (t) => {
  const { c, agent, user, send, buy } = await fixture(t, { bond: payout });
  await rejectsWith(c.connect(user).buyCover.staticCall(1, 1, { value: premium }), 'BonoInsuficiente', c);
  await send(c.connect(agent).stakeBond({ value: parseEther('0.29') }));
  await buy();
  assert.equal(await c.totalPolizas(), 1n);
});

test('retiro con pólizas conserva el mínimo completo, incluso al vencer la cobertura', async (t) => {
  const { c, agent, send, buy, at } = await fixture(t);
  await buy();
  await rejectsWith(c.connect(agent).retirarBono.staticCall(parseEther('0.20') + 1n), 'BonoInsuficiente', c);
  await send(c.connect(agent).retirarBono(parseEther('0.20')));
  assert.equal(await c.bondBalance(), parseEther('0.30'));
  const end = Number((await c.getPolicy(1)).fin);
  await at(end);
  await rejectsWith(c.connect(agent).retirarBono.staticCall(1n), 'BonoInsuficiente', c);
  await at(end + 120);
  await send(c.connect(agent).retirarBono(parseEther('0.30')));
  assert.equal(await c.exposicionTotal(), 0n);
  assert.equal(await c.bondBalance(), 0n);
});

test('un reclamo reduce el bono, bloquea retiros adicionales y permite pagar los derechos restantes', async (t) => {
  const { c, agent, user, send, buy, report } = await fixture(t, { bond: parseEther('0.30') });
  await buy(); await buy(); await report();
  const fund = await c.fundBalance();
  await send(c.connect(user).claimAgentFailure(1));
  assert.equal(await c.bondBalance(), parseEther('0.29'));
  await rejectsWith(c.connect(agent).retirarBono.staticCall(1n), 'BonoInsuficiente', c);
  await send(c.connect(user).claimAgentFailure(2));
  assert.equal(await c.fundBalance(), fund);
  assert.equal(await c.exposicionTotal(), 0n);
  await send(c.connect(agent).retirarBono(parseEther('0.28')));
  assert.equal(await c.bondBalance(), 0n);
});

test('el límite de reservas admite 30 pólizas y su bono cubre los 30 reclamos', async (t) => {
  const { c, user, send, buy, report } = await fixture(t, { bond: parseEther('0.30') });
  for (let index = 0; index < 30; index++) await buy();
  await rejectsWith(c.connect(user).buyCover.staticCall(1, 1, { value: premium }), 'LimitePolizas', c);
  await report();
  const fund = await c.fundBalance();
  for (let id = 1; id <= 30; id++) {
    await send(c.connect(user).claimAgentFailure(id));
    assert.equal((await c.getPolicy(id)).estado, 1n);
    assert.equal(await c.bondBalance(), payout * BigInt(30 - id));
  }
  assert.equal(await c.bondBalance(), 0n);
  assert.equal(await c.fundBalance(), fund);
  assert.equal((await c.getOutage(1)).pagosRealizados, 30n);
  await rejectsWith(c.connect(user).claimAgentFailure.staticCall(1), 'YaPagada', c);
});

test('reservas respetan el tope configurado y payouts y reclamos consumen el mismo cupo', async (t) => {
  const { c, agent, user, send, buy, report } = await fixture(t, { cap: 2, bond: payout * 2n });
  await buy(); await buy();
  await rejectsWith(c.connect(user).buyCover.staticCall(1, 1, { value: premium }), 'LimitePolizas', c);
  await report();
  const fund = await c.fundBalance();
  await send(c.connect(agent).payout(1));
  assert.equal(await c.bondBalance(), payout * 2n);
  await send(c.connect(user).claimAgentFailure(2));
  assert.equal(await c.bondBalance(), payout);
  assert.equal(await c.fundBalance(), fund - payout);
  assert.equal((await c.getOutage(1)).pagosRealizados, 2n);
});
