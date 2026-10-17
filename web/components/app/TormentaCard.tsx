import { C } from '../colores';
import type { Tormenta } from '@/hooks/tipos';
import { secs } from '@/hooks/formato';

export function TormentaCard({ storm, oculta }: { storm: Tormenta; oculta: boolean }) {
  const pagadas = storm.paid.filter(Boolean).length;
  const status = pagadas + '/30 · ' + (storm.end ? secs(storm.end - storm.start) : secs(performance.now() - storm.start));
  return (
    <section aria-label="Modo Tormenta" className={`flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-card ${oculta ? 'max-[759px]:hidden' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
        <span className="text-[17px] font-medium">Modo Tormenta</span>
        <span className="font-mono text-[14px] text-ink-2">{status}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {storm.paid.map((p, i) => (
          <div key={i} className="flex h-10 overflow-hidden rounded-full bg-[#ececec]">
            <span
              className="flex w-9 flex-none items-center justify-center font-mono text-[13px] transition-[background,color] duration-[220ms] ease-[ease]"
              style={{ background: p ? C.green : '#e0e0e0', color: p ? '#fff' : C.muted }}
            >
              {i + 1}
            </span>
            <span className="flex flex-1 items-center justify-center border-l border-white text-[13.5px]">{p ? 'pagada' : 'activa'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
