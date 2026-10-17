import assert from 'node:assert/strict';
import test from 'node:test';
import { Contract, Interface, parseEther } from 'ethers';
import artifact from '../../contracts/DowntimeCover (1).json';
import { ABI } from './abi';
import { idPolizaComprada, leerParametrosContrato } from './contrato';

const compiledInterface = new Interface(artifact.abi);
const address = '0x0000000000000000000000000000000000000001';

test('receipt conserva IDs uint256 grandes y descarta eventos emitidos por otra dirección', () => {
  const id = 900719925474099312345n;
  const event = compiledInterface.encodeEventLog(compiledInterface.getEvent('CoverComprada')!,
    [id, address, 1n, 100n, 14500n, parseEther('0.004')]);
  const log = { address, ...event };
  assert.equal(idPolizaComprada([log], address), id.toString());
  assert.equal(idPolizaComprada([{ ...log, address: '0x0000000000000000000000000000000000000002' }], address), undefined);
  assert.equal(idPolizaComprada([{ address, topics: [], data: '0x' }], address), undefined);
});

test('ABI web codifica la firma actual del reporte y reconoce los errores compilados', () => {
  const web = new Interface(ABI);
  const data = web.encodeFunctionData('reportOutage', [1n, 100n, 10n, '0x' + 'ab'.repeat(32)]);
  const decoded = compiledInterface.decodeFunctionData('reportOutage', data);
  assert.deepEqual([...decoded].slice(0, 3), [1n, 100n, 10n]);
  assert.equal(web.getFunction('poolDisponible'), null);
  for (const name of ['BonoInsuficiente', 'ReporteFueraDePlazo', 'DerechoPendiente', 'PrimaIncorrecta', 'NoEsDueno']) {
    assert.equal(web.parseError(compiledInterface.encodeErrorResult(name))?.name, name);
  }
});

test('fallo RPC al leer parámetros se propaga sin sustituirlo por saldos de demo', async () => {
  const c = new Contract(address, ABI, { provider: null, call: async () => { throw new Error('RPC no disponible'); } });
  await assert.rejects(leerParametrosContrato(c), /RPC no disponible/);
});
