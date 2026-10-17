// NEXT_PUBLIC_API_BASE vacío = simulador local. "/" = API del mismo Next.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').trim();

export const usaApi = API_BASE !== '';
export const apiUrl = (path: string) => API_BASE.replace(/\/$/, '') + '/api/' + path;

export async function post<T = Record<string, unknown>>(path: string, body?: unknown): Promise<(T & { error?: string }) | null> {
  if (!usaApi) return null;
  try {
    const r = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch (e) {
    return { error: String(e) } as T & { error?: string };
  }
}
