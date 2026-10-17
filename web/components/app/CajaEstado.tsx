export interface Caja {
  head: string;
  meta: string;
  glyph: string;
  color: string;
  text: string;
  hasBar: boolean;
  barPct: string;
  url: string;
  linkLabel: string;
  actionLabel: string;
  action: (() => void) | null;
}

/** Caja de estado de la póliza: sin cobertura, vigilando, sin respuesta, reportada, plazo, pagada, expirada. */
export function CajaEstado({ caja }: { caja: Caja }) {
  return (
    <div className="rounded-[4px] border border-line">
      <div className="flex items-center justify-between border-b border-line px-[14px] py-[10px] text-[14px]">
        <span>{caja.head}</span>
        <span className="font-mono text-[13px] text-muted">{caja.meta}</span>
      </div>
      <div className="flex items-start gap-3 px-[14px] py-4">
        <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[14px] font-semibold text-white transition-[background] duration-200 ease-[ease]" style={{ background: caja.color }}>
          {caja.glyph}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <span className="text-pretty text-[17px] leading-[1.45]">{caja.text}</span>
          {caja.hasBar && (
            <div className="my-1 h-[3px] overflow-hidden rounded-[2px] bg-[#efefef]">
              <div className="h-full transition-[width] duration-[250ms] ease-linear" style={{ width: caja.barPct, background: caja.color }} />
            </div>
          )}
          {caja.linkLabel && (
            <a href={caja.url} target="_blank" rel="noopener" className="self-start text-[17px] text-[oklch(0.7_0.17_55)] hover:text-[oklch(0.6_0.17_55)] hover:underline">
              {caja.linkLabel}
            </a>
          )}
          {caja.actionLabel && caja.action && (
            <button type="button" onClick={caja.action} className="cursor-pointer self-start border-0 bg-transparent p-0 text-[17px] text-[oklch(0.7_0.17_55)] hover:underline">
              {caja.actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
