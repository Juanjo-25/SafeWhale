import { Fragment } from 'react';
import { SeccionCabecera, tarjeta } from './ui';

const filas = [
  { k: 'Cómo se decide', a: 'Monitor de demo y reglas del contrato', b: 'El mismo proveedor', c: 'Un ajustador revisa el caso' },
  { k: 'Cómo te pagan', a: 'MON de prueba, tras reporte y confirmación', b: 'Créditos en la próxima factura', c: 'Tras el reclamo, en semanas' },
  { k: 'Monto', a: 'Fijo, conocido de antemano', b: 'Un % de lo que pagas al proveedor', c: 'Según la pérdida demostrada' }
];

const celda = 'border-t border-line-soft px-3 py-4 text-[15.5px]';

export function Comparacion() {
  return (
    <section id="comparar" className="flex scroll-mt-[100px] flex-col gap-[clamp(28px,4vw,48px)]">
      <SeccionCabecera eyebrow="06 · Comparación" titulo="Como el SOAT: sabes cuánto te pagan antes de que pase." />
      <div className={`${tarjeta} overflow-x-auto px-[clamp(14px,2.4vw,28px)] py-2`}>
        <div className="grid min-w-[680px] grid-cols-[1.1fr_1.2fr_1fr_1fr]">
          <span className="pb-[14px] pr-3 pt-[18px] text-[14px] text-muted" />
          <span className="flex items-center gap-2 px-3 pb-[14px] pt-[18px] text-[17px] font-medium">
            <span className="h-[10px] w-[10px] rounded-full bg-brand" />SafeWhale
          </span>
          <span className="px-3 pb-[14px] pt-[18px] text-[17px] text-ink-2">Garantía del proveedor</span>
          <span className="px-3 pb-[14px] pt-[18px] text-[17px] text-ink-2">Seguro cibernético</span>
          {filas.map((f) => (
            <Fragment key={f.k}>
              <span className="border-t border-line-soft py-4 pr-3 text-[14.5px] text-muted">{f.k}</span>
              <span className={`${celda} bg-[oklch(0.98_0.015_60)]`}>{f.a}</span>
              <span className={`${celda} text-ink-2`}>{f.b}</span>
              <span className={`${celda} text-ink-2`}>{f.c}</span>
            </Fragment>
          ))}
        </div>
      </div>
      <span className="text-pretty text-[13.5px] text-[#4a4a4a]">Comparación general con fines informativos. Revisa las condiciones de cada producto antes de contratar.</span>
    </section>
  );
}
