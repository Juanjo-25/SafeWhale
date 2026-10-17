import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BackendEnvironment } from './env-schema';
import { publicRequestUrl } from './request-origin';

const cookieName = 'safewhale_demo';
const seal = (value: string, env: BackendEnvironment) => createHmac('sha256', env.DEMO_API_TOKEN!).update(value).digest('hex');
export function sessionAuthorized(request: Request, env: BackendEnvironment) {
  if (!env.DEMO_API_TOKEN) return false;
  const value = request.headers.get('cookie')?.split(';').map((p) => p.trim()).find((p) => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!value) return false;
  const [expires, signature] = value.split('.');
  if (!/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature ?? '') || Number(expires) < Date.now() / 1000) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(seal(expires, env), 'hex'));
}
export function demoSessionCookie(request: Request, env: BackendEnvironment) {
  const expires = String(Math.floor(Date.now() / 1000) + 8 * 3600);
  return `${cookieName}=${expires}.${seal(expires, env)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${publicRequestUrl(request, env.DEMO_API_TOKEN).protocol === 'https:' ? '; Secure' : ''}`;
}
export function readAccessAuthorized(request: Request, env: BackendEnvironment) {
  if (sessionAuthorized(request, env)) return true;
  if (env.BACKEND_MODE === 'simulado') {
    const url = publicRequestUrl(request, env.DEMO_API_TOKEN);
    const local = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    try {
      const host = new URL(`${url.protocol}//${request.headers.get('host') ?? url.host}`);
      if (local(url.hostname) && local(host.hostname)) return true;
    } catch { /* Un Host inválido no habilita acciones. */ }
  }
  if (!env.DEMO_API_TOKEN) return false;
  const supplied = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  const actual = Buffer.from(supplied), expected = Buffer.from(env.DEMO_API_TOKEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
