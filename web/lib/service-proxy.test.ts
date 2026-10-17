import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proxyBackend } from './service-proxy';
import { assertSameOrigin } from './api';
import { demoSessionCookie } from './session';
import { parseEnvironment } from './env-schema';
import { publicRequestUrl, publicSignatureHeader, publicUrlHeader } from './request-origin';

const token = 'token-sintetico-para-pruebas-000000000';
test('binding conserva origen HTTPS, cookie y replay; reemplaza headers de contexto falsificados', async (t) => {
  const previous = process.env;
  process.env = { NODE_ENV: 'test', API_URL: 'http://api.internal/', DEMO_API_TOKEN: token, VERCEL: '1' };
  t.after(() => { process.env = previous; });
  let forwarded: Request | undefined;
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    forwarded = new Request(url, init);
    assert.equal(forwarded.url, 'http://api.internal/api/demo-session?demo=1');
    assert.equal(forwarded.headers.get('cookie'), 'safewhale_demo=synthetic');
    assert.equal(forwarded.headers.get('idempotency-key'), 'purchase-key-001');
    assert.equal(forwarded.headers.get('host'), null);
    assert.equal(publicRequestUrl(forwarded, token).href, 'https://demo.example/api/demo-session?demo=1');
    assert.doesNotThrow(() => assertSameOrigin(forwarded!, token));
    const cookie = demoSessionCookie(forwarded, parseEnvironment({ DEMO_API_TOKEN: token }));
    assert.match(cookie, /; Secure$/);
    return Response.json({ ok: true, txHash: '0xsynthetic' }, { status: 201, headers: {
      'Set-Cookie': cookie, 'Idempotency-Replayed': 'true',
    } });
  }) as typeof fetch;
  const response = await proxyBackend(new Request('https://demo.example/api/demo-session?demo=1', {
    method: 'POST', headers: { Origin: 'https://demo.example', Cookie: 'safewhale_demo=synthetic',
      'Content-Type': 'application/json', 'Idempotency-Key': 'purchase-key-001',
      [publicUrlHeader]: 'http://evil.example/api/demo-session', [publicSignatureHeader]: 'a'.repeat(64),
    }, body: JSON.stringify({ token }),
  }), 'demo-session', fetcher);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('idempotency-replayed'), 'true');
  assert.match(response.headers.get('set-cookie')!, /HttpOnly.*Secure/);
  assert.equal((await response.json()).txHash, '0xsynthetic');
  assert.equal((await forwarded!.json()).token, token);
  const forged = new Headers(forwarded!.headers); forged.set(publicUrlHeader, 'https://evil.example/api/demo-session?demo=1');
  assert.throws(() => assertSameOrigin(new Request(forwarded!.url, { method: 'POST', headers: forged }), token));
});

test('Vercel sin binding falla explícitamente; no usa localhost ni ejecuta compras en la web', async (t) => {
  const previous = process.env; process.env = { NODE_ENV: 'test', VERCEL: '1' };
  t.after(() => { process.env = previous; });
  const response = await proxyBackend(new Request('https://demo.example/api/comprar', { method: 'POST' }), 'comprar');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.codigo, 'SERVICE_BINDING_MISSING');
});

test('error de transporte mantiene respuesta reintentable sin filtrar URL privada y limita el body', async (t) => {
  const previous = process.env;
  process.env = { NODE_ENV: 'test', API_URL: 'https://api.internal/?private=secret', DEMO_API_TOKEN: token, VERCEL: '1' };
  t.after(() => { process.env = previous; });
  const broken = (async () => { throw new Error('https://api.internal/?private=secret'); }) as typeof fetch;
  const response = await proxyBackend(new Request('https://demo.example/api/comprar', { method: 'POST' }), 'comprar', broken);
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private=secret'));
  const large = await proxyBackend(new Request('https://demo.example/api/comprar', { method: 'POST', body: 'x'.repeat(4097) }), 'comprar', broken);
  assert.equal(large.status, 413);
});
