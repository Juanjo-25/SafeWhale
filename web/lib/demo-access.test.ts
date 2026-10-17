import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { authorizeDemoRequest } from './api.ts';
import { parseEnvironment } from './env-schema.ts';
import { POST as buy } from '../../api/app/api/comprar/route.ts';
import { GET as state } from '../../api/app/api/estado/route.ts';
import { POST as login } from '../../api/app/api/demo-session/route.ts';

test('compra local sin token, cookie ni login', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'safewhale-no-token-'));
  const previous = process.env;
  process.env = { NODE_ENV: 'test', BACKEND_MODE: 'simulado', STATE_FILE: join(directory, 'state.json') };
  t.after(async () => { process.env = previous; await rm(directory, { recursive: true, force: true }); });
  const response = await buy(new Request('http://localhost:3003/api/comprar', { method: 'POST', headers: {
    Host: '127.0.0.1:3003', Origin: 'http://127.0.0.1:3003', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(),
  }, body: JSON.stringify({ servicioId: 1, horas: 4 }) }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).poliza.id, '1');
});

test('el acceso libre se limita a loopback y rechaza páginas de otro origen', () => {
  const env = parseEnvironment({});
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.doesNotThrow(() => authorizeDemoRequest(new Request(`http://${hostname}:3001/api/chat`, { method: 'POST' }), env));
  }
  const sources: Record<string, string>[] = [{ Origin: 'https://otro.example' }, { 'Sec-Fetch-Site': 'cross-site' }];
  for (const headers of sources) {
    assert.throws(() => authorizeDemoRequest(new Request('http://localhost/api/chat', { method: 'POST', headers }), env), /mismo servidor/);
  }
  assert.throws(() => authorizeDemoRequest(new Request('https://demo.example/api/chat', { method: 'POST' }), env), /DEMO_API_TOKEN/);
  assert.throws(() => authorizeDemoRequest(new Request('http://localhost/api/chat', { method: 'POST', headers: { Host: 'demo.example' } }), env), /DEMO_API_TOKEN/);
  const token = 'token-sintetico-para-pruebas-000000000';
  const protectedEnv = parseEnvironment({ DEMO_API_TOKEN: token });
  assert.throws(() => authorizeDemoRequest(new Request('https://demo.example/api/chat', { method: 'POST' }), protectedEnv), /autorización/);
  assert.doesNotThrow(() => authorizeDemoRequest(new Request('https://demo.example/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), protectedEnv));
});

test('una preview simulada publica acceso pendiente y permite habilitarlo con sesión segura', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'safewhale-preview-'));
  const previous = process.env;
  const token = 'token-sintetico-para-pruebas-000000000';
  process.env = { NODE_ENV: 'test', BACKEND_MODE: 'simulado', STATE_FILE: join(directory, 'state.json'), DEMO_API_TOKEN: token };
  t.after(async () => { process.env = previous; await rm(directory, { recursive: true, force: true }); });
  assert.equal((await (await state(new Request('https://preview.example/api/estado'))).json()).autorizado, false);
  const response = await login(new Request('https://preview.example/api/demo-session', { method: 'POST',
    headers: { Origin: 'https://preview.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /Secure/);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await (await state(new Request('https://preview.example/api/estado', { headers: { Cookie: cookie } }))).json()).autorizado, true);
});
