import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const publicUrlHeader = 'x-safewhale-public-url';
export const publicSignatureHeader = 'x-safewhale-public-signature';

export function signPublicUrl(method: string, url: string, secret: string) {
  return createHmac('sha256', secret).update('safewhale-proxy-v1\n' + method + '\n' + url).digest('hex');
}

// El proxy elimina los headers del cliente y firma el URL público. Conservarlo
// permite verificar Origin y emitir una cookie Secure aunque el binding use HTTP.
export function publicRequestUrl(request: Request, secret?: string): URL {
  const forwarded = request.headers.get(publicUrlHeader);
  const signature = request.headers.get(publicSignatureHeader);
  if (forwarded && secret && /^[a-f0-9]{64}$/.test(signature ?? '')) {
    const expected = signPublicUrl(request.method, forwarded, secret);
    if (timingSafeEqual(Buffer.from(signature!, 'hex'), Buffer.from(expected, 'hex'))) {
      try {
        const url = new URL(forwarded);
        const internal = new URL(request.url);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
            url.pathname === internal.pathname && url.search === internal.search) return url;
      } catch { /* Un contexto inválido no sustituye el URL recibido. */ }
    }
  }
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (host) { try { return new URL(url.pathname + url.search, `${url.protocol}//${host}`); } catch { /* Host inválido */ } }
  return url;
}
