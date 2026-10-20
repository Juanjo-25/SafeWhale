import Link from 'next/link';
import { tarjeta } from './ui';

const pasos = [
  'Cotiza y compra 4 horas por chat.',
  'Atacas al agente: el pago inválido revierte.',
  'Tumbas el mock y espera el umbral de observación y la confirmación.',
  'Modo Tormenta: hasta 30 pagos procesados uno a uno, con receipt.',
  'Apagas el agente y cobras de su bono.'
];

export function DemoSeccion() {
  return (
    <section id="demo" className="grid scroll-mt-[100px] grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-stretch gap-[clamp(16px,2.4vw,28px)]">
      <div className={`${tarjeta} flex flex-col gap-5 p-[clamp(24px,3vw,36px)]`}>
        <span className="font-mono text-[14px] text-[oklch(0.6_0.17_55)]">05 · Demo guiada</span>
        <h2 className="m-0 text-balance text-[clamp(30px,3.6vw,44px)] font-medium leading-[1.05] tracking-[-0.035em]">Rómpelo tú mismo.</h2>
        <div className="flex flex-col">
          {pasos.map((t, i) => (
            <div key={t} className="flex items-baseline gap-[14px] border-t border-line-soft py-3">
              <span className="w-5 flex-none font-mono text-[13px] text-muted">{i + 1}</span>
              <span className="text-[16.5px] leading-[1.45]">{t}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <Link href="/app?demo=1" className="flex h-[54px] items-center justify-center rounded-[4px] bg-brand text-[16px] font-medium text-white no-underline transition duration-150 hover:bg-brand-hover hover:text-white active:scale-[0.98]">
          Ver demo en vivo
        </Link>
      </div>
      <div className={`${tarjeta} flex p-[14px]`}>
        <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-[18px] bg-[repeating-linear-gradient(135deg,#f1f1f1_0_10px,#e9e9e9_10px_20px)] p-5">
          <span className="rounded-[4px] bg-white px-3 py-2 text-center font-mono text-[13px] text-[#4a4a4a]">video de la demo · 90 s</span>
        </div>
      </div>
    </section>
  );
}
