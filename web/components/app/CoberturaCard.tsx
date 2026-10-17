import { CajaEstado, type Caja } from './CajaEstado';

export interface EventoReciente { titulo: string; hora: string; url: string }

interface Props {
  oculta: boolean; // oculta en mobile cuando no es la pestaña activa
  titulo: string;
  valor: string;
  unidad: string;
  sub: string;
  progreso: { pct: string; color: string } | null;
  caja: Caja;
  recientes: EventoReciente[];
  recientesLabel: string;
  mostrarRecientes: boolean;
  onToggleRecientes: () => void;
  onCubrir: () => void;
  puedeReclamar: boolean;
  onReclamar: () => void;
  explorerUrl: string;
}

const accion = 'flex min-h-[120px] flex-col items-center justify-center gap-[10px] rounded-[4px] border border-line bg-white transition duration-150 hover:bg-[#fafafa] active:scale-[0.97]';

export function CoberturaCard(p: Props) {
  return (
    <section
      aria-label="Tu cobertura"
      className={`flex min-h-[620px] flex-col gap-[22px] rounded-[36px] bg-white px-5 pb-5 pt-7 shadow-pol max-[759px]:min-h-0 ${p.oculta ? 'max-[759px]:hidden' : ''}`}
    >
      <div className="flex flex-col items-center gap-[6px] pt-[18px] text-center">
        <span className="text-[17px] font-medium text-muted">{p.titulo}</span>
        <span className="font-mono text-[clamp(30px,4vw,36px)] leading-[1.15] tracking-[-0.02em]">
          {p.valor}
          <span className="pl-[6px] font-sans text-[0.8em]">{p.unidad}</span>
        </span>
        <span className="font-mono text-[17px] text-ink-2">{p.sub}</span>
      </div>

      {p.progreso && (
        <div className="mx-[6px] h-[3px] overflow-hidden rounded-[2px] bg-[#efefef]">
          <div className="h-full transition-[width] duration-300 ease-linear" style={{ width: p.progreso.pct, background: p.progreso.color }} />
        </div>
      )}

      <CajaEstado caja={p.caja} />

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-[10px]">
        <button
          type="button"
          onClick={p.onToggleRecientes}
          aria-expanded={p.mostrarRecientes}
          className="hit-44 flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 bg-soft px-[18px] text-[16px] transition-transform duration-150 active:scale-[0.97]"
        >
          <span className="inline-block transition-transform duration-[220ms] ease-[ease]" style={{ transform: p.mostrarRecientes ? 'rotate(180deg)' : 'rotate(0deg)' }}>⌃</span>
          {p.recientesLabel}
        </button>
        {p.mostrarRecientes && (
          <div className="flex w-full flex-col">
            {p.recientes.map((r, i) => (
              <a key={i} href={r.url || undefined} target="_blank" rel="noopener" className="flex justify-between gap-[10px] border-t border-line-soft px-1 py-[10px] text-[14px] text-ink">
                <span>{r.titulo}</span>
                <span className="font-mono text-muted">{r.hora}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-[10px]">
        <button type="button" onClick={p.onCubrir} className={`${accion} cursor-pointer`}>
          <span className="text-[24px] leading-none">+</span><span className="text-[15px] text-[#4a4a4a]">Cubrir</span>
        </button>
        <button type="button" onClick={p.onReclamar} disabled={!p.puedeReclamar} className={`${accion} cursor-pointer disabled:cursor-default`} style={{ opacity: p.puedeReclamar ? 1 : 0.4 }}>
          <span className="text-[24px] leading-none">↓</span><span className="text-[15px] text-[#4a4a4a]">Reclamar</span>
        </button>
        {p.explorerUrl ? <a href={p.explorerUrl} target="_blank" rel="noopener" className={`${accion} text-ink`}>
          <span className="text-[24px] leading-none">↗</span><span className="text-[15px] text-[#4a4a4a]">Explorer</span>
        </a> : <span className={`${accion} opacity-40`}><span className="text-[24px] leading-none">·</span><span className="text-[15px]">Sin tx on-chain</span></span>}
      </div>
    </section>
  );
}
