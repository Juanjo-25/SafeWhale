'use client';

import { useMemo } from 'react';
import { FrontendApiError, post } from './api';
import { mapPolicy } from './estado-api';
import type { RespuestaAgente } from './tipos';

export function createActions(refresh: () => Promise<void>, saved?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  let storage = saved;
  try { storage ??= typeof window !== 'undefined' ? window.sessionStorage : undefined; } catch { /* Webview sin almacenamiento. */ }
  const pending = new Map<string, string>();
  async function mutate<T>(path: string, body: unknown): Promise<T> {
    const fingerprint = JSON.stringify({ path, body });
    const storageKey = 'safewhale:pending:' + fingerprint;
    let persisted: string | null = null;
    try { persisted = storage?.getItem(storageKey) ?? null; } catch { /* Sigue disponible la memoria. */ }
    const key = pending.get(fingerprint) ?? persisted ?? crypto.randomUUID();
    pending.set(fingerprint, key);
    try { storage?.setItem(storageKey, key); } catch { /* No almacenar tokens, solo claves de idempotencia. */ }
    const clear = () => { pending.delete(fingerprint); try { storage?.removeItem(storageKey); } catch { /* Memoria limpiada. */ } };
    try {
      const result = await post<T>(path, body, key);
      clear();
      try { await refresh(); } catch { /* La mutación ya se confirmó; no comprar otra vez por un fallo de polling. */ }
      return result;
    } catch (error) {
      if (error instanceof FrontendApiError && error.status >= 400 && error.status < 500) clear();
      throw error;
    }
  }
  return {
    async comprar(horas: number, servicioId: number) {
      const result = await mutate<{ poliza: unknown; modo: string; txHash: string | null }>('comprar', { horas, servicioId });
      return { poliza: mapPolicy(result.poliza), modo: result.modo, txHash: result.txHash };
    },
    tumbar: (servicioId: number) => mutate('tumbar', { servicioId }),
    restaurar: (servicioId: number) => mutate('restaurar', { servicioId }),
    reclamar: (id: number | string) => mutate('reclamar', { polizaId: String(id) }),
    atacar: (id: number | string) => mutate('atacar', { polizaId: String(id) }),
    apagarAgente: (activo = false) => mutate('apagar-agente', { activo }),
    tormenta: (ids: (number | string)[]) => mutate<{ duracionMs: number; resultados: { polizaId: string; ok: boolean; txHash: string | null; motivo: string | null }[] }>('tormenta', { polizaIds: ids.slice(0, 30).map(String) }),
    async chat(mensaje: string): Promise<RespuestaAgente> {
      const result = await post<{ mensaje: string; compraPropuesta: { horas: number; servicioId: number; prima: string; pagoFijo: string } | null }>('chat', { mensaje });
      return { text: result.mensaje, quote: !!result.compraPropuesta, horas: result.compraPropuesta?.horas,
        svc: result.compraPropuesta?.servicioId, prima: result.compraPropuesta?.prima, pagoFijo: result.compraPropuesta?.pagoFijo,
      };
    },
  };
}

export function useAcciones(refresh: () => Promise<void>) {
  return useMemo(() => createActions(refresh), [refresh]);
}
