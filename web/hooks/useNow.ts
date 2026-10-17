'use client';

import { useEffect, useState } from 'react';

/** Reloj que vuelve a renderizar cada `ms` (cuentas regresivas y barras). */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
