import 'server-only';
import { publicRequestUrl, publicSignatureHeader, publicUrlHeader, signPublicUrl } from './request-origin';

// La ejecución local reutiliza los handlers canónicos. En Vercel siempre se
// utiliza API_URL, resuelto por el binding al llegar una petición a la función.
const localRoutes = {
  'apagar-agente': () => import('../../api/app/api/apagar-agente/route'),
  atacar: () => import('../../api/app/api/atacar/route'),
  chat: () => import('../../api/app/api/chat/route'),
  comprar: () => import('../../api/app/api/comprar/route'),
  'demo-session': () => import('../../api/app/api/demo-session/route'),
  estado: () => import('../../api/app/api/estado/route'),
  'exchange-mock': () => import('../../api/app/api/exchange-mock/route'),
  health: () => import('../../api/app/api/health/route'),
  reclamar: () => import('../../api/app/api/reclamar/route'),
  restaurar: () => import('../../api/app/api/restaurar/route'),
  tormenta: () => import('../../api/app/api/tormenta/route'),
  tumbar: () => import('../../api/app/api/tumbar/route'),
};
const failure = (codigo: string, mensaje: string, status = 503) => Response.json({ ok: false,
  error: { codigo, mensaje }, txHash: null }, { status, headers: { 'Cache-Control': 'no-store' } });

async function limitedBody(request: Request): Promise<string | undefined> {
  if (!request.body || ['GET', 'HEAD'].includes(request.method)) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new RangeError('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function proxyBackend(request: Request, endpoint: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!(endpoint in localRoutes)) return failure('NOT_FOUND', 'Ruta no disponible.', 404);
  const binding = process.env.API_URL;
  if (!binding) {
    if (process.env.VERCEL === '1') return failure('SERVICE_BINDING_MISSING', 'Vercel debe inyectar el binding API_URL en web.');
    const routes = await localRoutes[endpoint as keyof typeof localRoutes]();
    const handler = (routes as Record<string, unknown>)[request.method];
    if (typeof handler !== 'function') return failure('METHOD_NOT_ALLOWED', 'Método no permitido.', 405);
    return handler(request);
  }
  const secret = process.env.DEMO_API_TOKEN;
  if (!secret || secret.length < 32) return failure('DEMO_TOKEN_MISSING', 'Configura DEMO_API_TOKEN para los servicios web y api.');
  try {
    const base = new URL(binding);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('binding');
    const incoming = new URL(request.url);
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    const target = new URL('api/' + endpoint, base); target.search = incoming.search;
    const headers = new Headers();
    for (const name of ['accept', 'content-type', 'authorization', 'cookie', 'idempotency-key', 'origin', 'sec-fetch-site']) {
      const value = request.headers.get(name); if (value !== null) headers.set(name, value);
    }
    const publicUrl = publicRequestUrl(new Request(request.url, { headers: { host: request.headers.get('host') ?? incoming.host } })).href;
    headers.set(publicUrlHeader, publicUrl);
    headers.set(publicSignatureHeader, signPublicUrl(request.method, publicUrl, secret));
    const upstream = await fetcher(target, { method: request.method, headers, body: await limitedBody(request),
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.any([request.signal, AbortSignal.timeout(285000)]),
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'set-cookie', 'idempotency-replayed', 'allow']) {
      const value = upstream.headers.get(name); if (value !== null) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RangeError) return failure('BODY_TOO_LARGE', 'El body supera el límite de 4 KB.', 413);
    return failure('BACKEND_UNAVAILABLE', 'No se pudo confirmar la respuesta del backend. Reintenta la misma acción con la misma clave.');
  }
}
