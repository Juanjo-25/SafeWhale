import assert from 'node:assert/strict';
import test from 'node:test';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, keccak256, toUtf8Bytes, parseEther } from 'ethers';
import { compileContract } from './compile.mjs';
import { ABI } from '../web/hooks/abi.ts';
import { idPolizaComprada, leerParametrosContrato } from '../web/hooks/contrato.ts';
import { CONTRACT_DEPLOYMENT, CONTRACT_LIMITS, DEMO_CONTRACT_PARAMETERS, DEMO_FUNDING, demoConstructorArgs } from '../shared/config.ts';
import { EstadoPoliza } from '../shared/types.ts';

const compiled = compileContract('shanghai');

async function fixture(t, parameters = DEMO_CONTRACT_PARAMETERS) {
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' }, miner: { timestampIncrement: 0 } });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const [owner, agent, user] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
  const agentAddress = await agent.getAddress();
  const p = parameters;
  const args = p === DEMO_CONTRACT_PARAMETERS ? demoConstructorArgs(agentAddress) : [
    agentAddress, p.precioHora, p.indemnizacion, p.stakeMinimo, p.carencia,
    p.tiempoReclamo, p.umbralSegundos, p.topePorEvento, p.maxHoras, p.plazoReporte,
  ];
  // El consumidor usa shared/abi.json; el bytecode se compila del Solidity actual.
  const c = await new ContractFactory(ABI, compiled.evm.bytecode.object, owner).deploy(...args);
  await c.waitForDeployment();
  const send = async (promise) => (await promise).wait();
  await send(c.fund({ value: DEMO_FUNDING.fondo }));
  await send(c.connect(agent).stakeBond({ value: DEMO_FUNDING.bono }));
  return { rpc, c, agent, user, send };
}

test('configuración compartida despliega localmente y el lector web obtiene todos los parámetros reales', async (t) => {
  const { c } = await fixture(t);
  if (CONTRACT_DEPLOYMENT) assert.equal(CONTRACT_DEPLOYMENT.chainId, 10143);
  assert.deepEqual(await leerParametrosContrato(c), { ...DEMO_CONTRACT_PARAMETERS,
    fondo: DEMO_FUNDING.fondo, bono: DEMO_FUNDING.bono });
  assert.equal(await c.SERVICIO_DEMO(), BigInt(CONTRACT_LIMITS.servicioId));
  assert.equal(await c.MAX_POLIZAS_CON_RESERVA(), BigInt(CONTRACT_LIMITS.maxPolizasConReserva));
  assert.ok(DEMO_CONTRACT_PARAMETERS.stakeMinimo >= DEMO_CONTRACT_PARAMETERS.indemnizacion * DEMO_CONTRACT_PARAMETERS.topePorEvento);
});

test('el lector usa valores del contrato desplegado en lugar de los defaults de demo', async (t) => {
  const custom = { precioHora: parseEther('0.002'), indemnizacion: parseEther('0.02'), stakeMinimo: parseEther('0.04'),
    carencia: 5n, tiempoReclamo: 45n, umbralSegundos: 12n, topePorEvento: 2n, maxHoras: 48n, plazoReporte: 180n };
  const { c, agent, send } = await fixture(t, custom);
  await send(c.connect(agent).retirarBono(parseEther('0.1')));
  assert.deepEqual(await leerParametrosContrato(c), { ...custom, fondo: DEMO_FUNDING.fondo, bono: parseEther('0.4') });
});

test('ABI compartido permite comprar, decodificar receipt, reportar con inicioCaida y pagar', async (t) => {
  const { c, agent, user, send, rpc } = await fixture(t);
  const p = DEMO_CONTRACT_PARAMETERS;
  const receipt = await send(c.connect(user).buyCover(CONTRACT_LIMITS.servicioId, 4, { value: p.precioHora * 4n }));
  assert.equal(idPolizaComprada(receipt.logs, await c.getAddress()), '1');
  const policy = await c.getPolicy(1);
  assert.equal(policy.dueno, await user.getAddress());
  assert.equal(policy.estado, BigInt(EstadoPoliza.Activa));
  const start = policy.inicio;
  await rpc.request({ method: 'evm_setTime', params: [Number(start + p.umbralSegundos) * 1000] });
  await rpc.request({ method: 'evm_mine', params: [] });
  const hash = keccak256(toUtf8Bytes('evidencia de prueba'));
  await send(c.connect(agent).reportOutage(1, start, p.umbralSegundos, hash));
  const outage = await c.getOutage(1);
  assert.equal(outage.inicio, start);
  assert.equal(outage.duracionSegundos, p.umbralSegundos);
  assert.equal(outage.evidenciaHash, hash);
  await send(c.connect(agent).payout(1));
  assert.equal((await c.getPolicy(1)).estado, BigInt(EstadoPoliza.Pagada));
  assert.equal(await c.fundBalance(), DEMO_FUNDING.fondo + 4n * p.precioHora - p.indemnizacion);
  assert.equal(await c.bondBalance(), DEMO_FUNDING.bono);
});
