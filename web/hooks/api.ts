// La interfaz usa las rutas del mismo servidor y una cookie HttpOnly.
export const usaApi = true;
export const apiUrl = (path: string) => '/api/' + path;
// Respaldo en memoria para webviews que no conservan Set-Cookie. No se persiste
// en localStorage, sessionStorage ni en variables públicas de compilación.
let demoAccessToken: string | undefined;
export function rememberDemoAccess(token: string) { demoAccessToken = token; }

export class FrontendApiError extends Error {
  constructor(readonly codigo: string, mensaje: string, readonly status = 0, readonly txHash: string | null = null) { super(mensaje); }
}

export async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(options.headers);
    if (demoAccessToken) headers.set('Authorization', 'Bearer ' + demoAccessToken);
    response = await fetch(apiUrl(path), { ...options, headers, cache: 'no-store', credentials: 'same-origin',
      signal: options.signal ?? AbortSignal.timeout(65000),
    });
  } catch {
    throw new FrontendApiError('CONNECTION_FAILED', 'No se pudo confirmar la respuesta del servidor. Comprueba la conexión y reintenta la misma acción.');
  }
  let body;
  try { body = await response.json(); } catch {
    throw new FrontendApiError('RESPONSE_INVALID', 'El servidor devolvió una respuesta inesperada.', response.status);
  }
  if (!response.ok || body?.ok === false) {
    throw new FrontendApiError(body?.error?.codigo ?? 'REQUEST_FAILED',
      body?.error?.mensaje ?? 'No se pudo completar la operación.', response.status,
      /^0x[\da-fA-F]{64}$/.test(body?.txHash ?? '') ? body.txHash : null);
  }
  return body as T;
}

export function post<T>(path: string, body: unknown = {}, key?: string): Promise<T> {
  return requestApi<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(key ? { 'Idempotency-Key': key } : {}),
  }, body: JSON.stringify(body) });
}

export const errorMessage = (error: unknown) => error instanceof FrontendApiError && error.txHash
  ? error.message + ' Transacción: ' + error.txHash : error instanceof Error ? error.message : 'No se pudo completar la operación.';
