'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, requestApi } from './api';
import { ZodError } from 'zod';
import { EMPTY_STATE, mapState } from './estado-api';

export function useEstado() {
  const [estado, setEstado] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    // Tras una acción, esperar el polling y pedir un estado nuevo.
    while (inFlight.current) await inFlight.current;
    if (!active.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]);
    inFlight.current = (async () => {
      try {
        const next = mapState(await requestApi('estado', { signal }));
        if (active.current && !abort.signal.aborted) { setEstado(next); setError(null); }
      } catch (error) {
        if (active.current && !abort.signal.aborted) setError(error instanceof ZodError ? 'El estado del servidor tiene un formato inesperado.' : errorMessage(error));
      } finally {
        if (active.current && !abort.signal.aborted) setLoading(false);
      }
    })();
    await inFlight.current;
    inFlight.current = null;
  }, []);

  useEffect(() => {
    active.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => { stopped = true; active.current = false; clearTimeout(timer); controller.current?.abort(); };
  }, [refresh]);

  return { estado, loading, error, refresh };
}
