import { ApiError, apiErrorResponse, assertSameOrigin, authorizeDemoRequest, backendEnvironment, readJsonBody } from '../../../../web/lib/api';
import { demoSessionCookie, readAccessAuthorized } from '../../../../web/lib/session';
import { z } from 'zod';
export const runtime = 'nodejs';
export function GET(request: Request) {
  try { const env = backendEnvironment(); return Response.json({ ok: true, autorizado: readAccessAuthorized(request, env) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const env = backendEnvironment(); assertSameOrigin(request);
    const input = z.object({ token: z.string().min(32).max(256) }).strict().safeParse(await readJsonBody(request));
    if (!input.success) throw new ApiError('TOKEN_INVALID', 'Introduce el token de acceso de la demo.');
    const headers = new Headers(request.headers); headers.set('authorization', 'Bearer ' + input.data.token); headers.delete('cookie');
    authorizeDemoRequest(new Request(request.url, { method: 'POST', headers }), env);
    return Response.json({ ok: true, autorizado: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': demoSessionCookie(request, env) } });
  } catch (error) { return apiErrorResponse(error); }
}

export const maxDuration = 300;
