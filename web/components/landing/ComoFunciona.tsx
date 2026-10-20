import type { ReactNode } from 'react';
import { SeccionCabecera, tarjeta } from './ui';

const caja = 'rounded-[4px] border border-line px-4 py-[14px]';
const circulo = 'flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[14px] text-white';

const pasos: { n: number; titulo: string; texto: string; visual: ReactNode }[] = [
  {
    n: 1,
    titulo: 'Compras horas por chat',
    texto: 'Eliges el servicio y las horas. En testnet la póliza queda registrada en el contrato.',
    visual: (
      <div className={`${caja} flex flex-col gap-[6px]`}>
        <div className="flex justify-between text-[14px]"><span>Horas a cubrir</span><span>Prima: <span className="font-mono">0,004 MON</span></span></div>
        <span className="font-mono text-[22px]">4 h</span>
      </div>
    )
  },
  {
    n: 2,
    titulo: 'El agente vigila',
    texto: 'En esta demo, el monitor revisa un mock cada 2 segundos y exige 10 segundos de caída continua antes de reportar.',
    visual: (
      <div className={`${caja} flex items-center gap-3`}>
        <span className={`${circulo} bg-brand font-semibold`}>!</span>
        <span className="flex-1 text-[15px]">Sin respuesta</span>
        <span className="font-mono text-[14px] text-muted">umbral: 10 s</span>
      </div>
    )
  },
  {
    n: 3,
    titulo: 'El contrato te paga',
    texto: 'Monto fijo en MON de prueba, directo al dueño de la póliza y sujeto al tope. Si el agente no paga, puedes reclamar del bono.',
    visual: (
      <div className={`${caja} flex items-center gap-3`}>
        <span className={`${circulo} bg-ok`}>✓</span>
        <span className="flex-1 text-[15px]">Pagado</span>
        <span className="font-mono text-[14px] text-muted">+0,01 MON</span>
      </div>
    )
  }
];

export function ComoFunciona() {
  return (
    <section id="como" className="flex scroll-mt-[100px] flex-col gap-[clamp(28px,4vw,48px)]">
      <SeccionCabecera eyebrow="02 · Cómo funciona" titulo="Tres pasos. Ningún formulario de reclamo." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[clamp(16px,2.4vw,28px)]">
        {pasos.map((p) => (
          <article key={p.n} className={`${tarjeta} flex flex-col gap-[18px] p-6`}>
            {p.visual}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[14px] text-muted">{p.n}</span>
              <h3 className="m-0 text-[22px] font-medium tracking-[-0.02em]">{p.titulo}</h3>
              <p className="m-0 text-pretty text-[16px] leading-[1.5] text-ink-2">{p.texto}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
