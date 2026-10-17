'use client';

import { useEffect, useState } from 'react';
import { C } from '../colores';

const CICLO_MS = 10000;
const N_BARRAS = 40;

// Alturas iniciales deterministas (LCG entero) para que el HTML del servidor y del cliente coincidan.
const barrasIniciales = (() => {
  let seed = 7;
  return Array.from({ length: N_BARRAS }, () => {
    seed = (seed * 9301 + 49297) % 233280;
    return 35 + (seed / 233280) * 50;
  });
})();

interface Anim { t0: number; now: number; bars: number[]; downs: boolean[]; lat: number }
interface Fase { status: string; dot: string; label: string; value: string; valueColor: string; polMeta: string; polText: string; pct: string }

const fmt = (n: number, d: number) => n.toFixed(d).replace('.', ',');
const elapsed = (now: number, t0: number) => ((now - t0) % CICLO_MS) / 1000;

function fase(e: number, lat: number): Fase {
  if (e < 3.5) return { status: 'En línea', dot: C.green, label: 'Tiempo de respuesta', value: lat + ' ms', valueColor: C.ink, polMeta: 'Activa', polText: 'Todo normal. Vigilo la pasarela mientras vendes.', pct: (e / 10 * 100) + '%' };
  if (e < 6.5) {
    const c = (e - 3.5) / 3 * 10;
    return { status: 'Sin respuesta', dot: C.orange, label: 'Caída en curso', value: fmt(c, 1) + ' / 10 s', valueColor: 'oklch(0.55 0.17 50)', polMeta: 'Umbral', polText: 'La pasarela no responde. Al pasar 10 s se reporta on-chain.', pct: (c * 10) + '%' };
  }
  if (e < 7.12) return { status: 'Caída reportada', dot: C.blue, label: 'reportOutage → payout', value: Math.round((e - 6.5) * 1000) + ' ms', valueColor: 'oklch(0.5 0.15 250)', polMeta: 'Pagando', polText: 'Caída reportada. El contrato ejecuta el pago.', pct: '100%' };
  return { status: 'Pagado', dot: C.green, label: 'Pagado a tu cuenta', value: '+0,5 MON', valueColor: 'oklch(0.5 0.14 150)', polMeta: 'Pagada', polText: 'Recibiste 0,5 MON. La pasarela sigue caída y tú ya cobraste.', pct: '100%' };
}

export function HeroAnimacion() {
  const [s, setS] = useState<Anim>({ t0: 0, now: 0, bars: barrasIniciales, downs: Array(N_BARRAS).fill(false), lat: 42 });

  useEffect(() => {
    const t0 = Date.now();
    setS((x) => ({ ...x, t0, now: t0 }));
    const iv = setInterval(() => {
      const now = Date.now();
      const down = elapsed(now, t0) >= 3.5;
      setS((x) => ({
        ...x,
        now,
        bars: [...x.bars.slice(1), down ? 8 : 35 + Math.random() * 50],
        downs: [...x.downs.slice(1), down],
        lat: down ? x.lat : Math.round(36 + Math.random() * 14)
      }));
    }, 160);
    return () => clearInterval(iv);
  }, []);

  const e = elapsed(s.now, s.t0);
  const h = fase(e, s.lat);
  const paid = e >= 7.12;

  return (
    <div aria-label="Animación: la pasarela de pagos se cae y el contrato paga" role="img" className="relative pb-14">
      <div className="flex flex-col gap-[22px] rounded-[36px] bg-white px-[22px] pb-[22px] pt-[26px] shadow-hero">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-medium text-muted">Pasarela de pagos</span>
          <span className="flex h-[30px] items-center gap-[7px] rounded-full bg-soft px-3 text-[13px]">
            <span className="h-[7px] w-[7px] rounded-full transition-[background] duration-200 ease-[ease]" style={{ background: h.dot }} />
            {h.status}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 py-[6px] text-center">
          <span className="text-[14px] text-muted">{h.label}</span>
          <span className="font-mono text-[clamp(34px,4vw,44px)] leading-[1.1] tracking-[-0.02em] transition-colors duration-200 ease-[ease]" style={{ color: h.valueColor }}>{h.value}</span>
        </div>
        <div className="flex h-16 items-end gap-[3px]">
          {s.bars.map((v, i) => (
            <span key={i} className="flex-1 rounded-[2px] transition-[height] duration-[160ms] ease-linear" style={{ height: v + '%', background: s.downs[i] ? C.red : '#d4d4d4' }} />
          ))}
        </div>
        <div className="rounded-[4px] border border-line">
          <div className="flex justify-between border-b border-line px-[14px] py-[10px] text-[14px]">
            <span>Póliza #12 · 8 h · Tienda online</span>
            <span className="font-mono text-[13px] text-muted">{h.polMeta}</span>
          </div>
          <div className="flex flex-col gap-2 p-[14px]">
            <span className="text-[15.5px] leading-[1.45]">{h.polText}</span>
            <div className="h-[3px] overflow-hidden rounded-[2px] bg-[#efefef]">
              <div className="h-full" style={{ width: h.pct, background: h.dot, transition: 'width 160ms linear, background 200ms ease' }} />
            </div>
          </div>
        </div>
      </div>
      <div
        className="absolute bottom-0 left-[clamp(-24px,-2vw,0px)] right-[clamp(16px,6vw,80px)] flex items-center gap-3 rounded-[22px] bg-white px-4 py-[14px] shadow-toast"
        style={{ transition: 'transform 420ms cubic-bezier(.2,1.2,.3,1), opacity 220ms ease', transform: paid ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)', opacity: paid ? 1 : 0 }}
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ok text-[17px] text-white">✓</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px]">+0,5 MON en tu cuenta</span>
          <span className="font-mono text-[13px] text-muted">payout(12) · 0,62 s después del reporte</span>
        </div>
      </div>
    </div>
  );
}
