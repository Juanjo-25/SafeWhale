'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Sigue un media query con matchMedia (reacciona a rotaciones y cambios de tamaño). */
export function useMediaQuery(query: string) {
  const suscribir = useCallback((fn: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return useSyncExternalStore(suscribir, () => window.matchMedia(query).matches, () => false);
}
