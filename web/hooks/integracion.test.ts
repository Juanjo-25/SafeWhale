import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapState, explorerLink } from './estado-api.ts';
import { createActions } from './useAcciones.ts';

const policy = { id: '9007199254740993', dueno: '0x0000000000000000000000000000000000000001', servicioId: 1, inicio: 1792260000, fin: 1792274400, estado: 'Activa' };
const state = { modo: 'simulado', chainId: 10143, contrato: null, cuentaDemo: policy.dueno, fondo: '1.004', bono: '0.500', agenteActivo: true,
  exchangeCaido: false, caidaIniciadaEn: null, parametros: { precioHora: '0.001', indemnizacion: '0.01', umbralSeg: 10, tiempoReclamoSeg: 30, topePorEvento: 30, maxHoras: 24 },
  servicios: [{id:1, nombre:'Binance', tipo:'Exchange', caido:false, caidaIniciadaEn:null}, {id:2, nombre:'Stripe', tipo:'Pagos', caido:false, caidaIniciadaEn:null}],
  polizas: [policy], eventos: [{ id: 'evt-1', tipo: 'CoverComprada', polizaId: policy.id, txHash: null, timestamp: policy.inicio, ok: true, motivo: null, origen: 'simulado' }],
};

test('adapta estado, segundos, montos, estados de póliza y IDs sin pérdida de precisión', () => {
  const result = mapState(state);
  assert.equal(result.polizas[0].id, policy.id);
  assert.equal(result.polizas[0].inicio, policy.inicio * 1000);
  assert.equal(result.polizas[0].estado, 0);
  assert.equal(result.polizas[0].horas, 4);
  assert.equal(result.precioHora, 0.001);
  assert.equal(result.fondo, 1.004);
  assert.equal(result.tiempoReclamoSeg, 30);
  assert.equal(explorerLink(result.eventos[0].txHash), '');
  assert.equal(explorerLink(undefined), '');
  assert.equal(mapState({ ...state, polizas: [{ ...policy, estado: 'Expirada' }] }).polizas[0].estado, 2);
  assert.throws(() => mapState({ ...state, fondo: 'no-es-dinero' }));
});

test('compra solo actualiza tras éxito y reintenta una respuesta perdida con la misma clave', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const keys: string[] = [];
  let refreshes = 0;
  globalThis.fetch = async (_url, options) => {
    const headers = new Headers(options!.headers);
    assert.equal(options!.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(options!.body as string), { horas: 4, servicioId: 1 });
    keys.push(headers.get('Idempotency-Key')!);
    if (keys.length === 1) throw new Error('respuesta perdida');
    return Response.json({ ok: true, modo: 'simulado', poliza: policy, txHash: null });
  };
  const actions = createActions(async () => { refreshes++; });
  await assert.rejects(actions.comprar(4, 1), /confirmar la respuesta/);
  assert.equal(refreshes, 0);
  assert.equal((await actions.comprar(4, 1)).poliza.id, policy.id);
  assert.equal(keys[0], keys[1]);
  assert.equal(refreshes, 1);
  await actions.comprar(4, 1);
  assert.notEqual(keys[1], keys[2]);
});

test('un rechazo del backend no crea compras locales y un fallo de Gemini no usa un parser local', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ ok: false, error: { codigo: 'EXCHANGE_DOWN', mensaje: 'Servicio caído' } }, { status: 409 });
  let refreshes = 0;
  const actions = createActions(async () => { refreshes++; });
  await assert.rejects(actions.comprar(4, 1), /Servicio caído/);
  assert.equal(refreshes, 0);
  globalThis.fetch = async () => Response.json({ ok: false, error: { codigo: 'GEMINI_QUOTA', mensaje: 'Cuota agotada' } }, { status: 429 });
  await assert.rejects(actions.chat('Cubre Exchange Demo por 4 horas'), /Cuota agotada/);
});

test('chat conserva cotización y servicio del backend y no compra automáticamente', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const paths: string[] = [];
  globalThis.fetch = async (url) => {
    paths.push(String(url));
    return Response.json({ ok: true, mensaje: 'Confirma la cobertura', compraPropuesta: { horas: 8, servicioId: 1, prima: '0.008', pagoFijo: '0.01' } });
  };
  const result = await createActions(async () => {}).chat('Cubre Exchange Demo por 8 horas');
  assert.deepEqual(result, { text: 'Confirma la cobertura', quote: true, horas: 8, svc: 1, prima: '0.008', pagoFijo: '0.01' });
  assert.deepEqual(paths, ['/api/chat']);
});

test('recarga de página recupera una compra pendiente con la misma clave sin repetirla', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
  const keys: string[] = [];
  globalThis.fetch = async (_, options) => { keys.push(new Headers(options?.headers).get('Idempotency-Key')!); throw new Error('respuesta perdida'); };
  await assert.rejects(createActions(async () => {}, storage).comprar(4, 1));
  globalThis.fetch = async (_, options) => { keys.push(new Headers(options?.headers).get('Idempotency-Key')!); return Response.json({ ok: true, modo: 'testnet', txHash: '0x' + 'ab'.repeat(32), poliza: policy }); };
  await createActions(async () => {}, storage).comprar(4, 1);
  assert.equal(keys[0], keys[1]); assert.equal(items.size, 0);
});
