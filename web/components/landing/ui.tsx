import type { ReactNode } from 'react';

export const tarjeta = 'rounded-[28px] bg-white shadow-card';
export const mono = 'font-mono';

interface SeccionCabeceraProps {
  eyebrow: string;
  titulo: ReactNode;
  texto?: string;
  ancho?: 'normal' | 'ancho';
}

export function SeccionCabecera({ eyebrow, titulo, texto, ancho = 'normal' }: SeccionCabeceraProps) {
  return (
    <div className={`flex flex-col gap-[18px] ${ancho === 'ancho' ? 'max-w-[820px]' : 'max-w-[780px]'}`}>
      <span className="font-mono text-[14px] text-[oklch(0.6_0.17_55)]">{eyebrow}</span>
      <h2 className="m-0 text-balance text-[clamp(34px,4.6vw,58px)] font-medium leading-[1.02] tracking-[-0.04em]">{titulo}</h2>
      {texto && <p className="m-0 text-pretty text-[19px] leading-[1.55] text-ink-2">{texto}</p>}
    </div>
  );
}

export const btnPrimario =
  'flex h-14 items-center whitespace-nowrap rounded-[4px] bg-brand px-[26px] text-[17px] font-medium text-white no-underline transition duration-150 hover:bg-brand-hover hover:text-white active:scale-[0.98]';
