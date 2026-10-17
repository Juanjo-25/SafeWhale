export interface FilaPool { glyph: string; label: string; value: string; sub: string; pct: number; color: string }

// La referencia deja la barra de % con display:none; cambiar a true para mostrarla.
const MOSTRAR_BARRA = false;

export function PoolCard({ filas, oculta }: { filas: FilaPool[]; oculta: boolean }) {
  return (
    <section aria-label="Estado del pool" className={`flex flex-auto flex-col justify-center rounded-[28px] bg-white px-6 py-2 shadow-card ${oculta ? 'max-[759px]:hidden' : ''}`}>
      {filas.map((row, i) => (
        <div key={row.label} className={`flex items-start gap-[14px] py-[18px] ${i ? 'border-t border-line-soft' : ''}`}>
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[15px] font-semibold text-white" style={{ background: row.color }}>{row.glyph}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="flex justify-between gap-[10px]">
              <span className="text-[17px]">{row.label}</span>
              <span className="whitespace-nowrap font-mono text-[15px] text-ink-2">{row.value}</span>
            </div>
            <span className="text-[14px] text-muted">{row.sub}</span>
            {MOSTRAR_BARRA && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 min-w-[4px] max-w-[calc(100%-44px)] rounded-[2px] transition-[width] duration-300 ease-[ease]" style={{ width: row.pct + '%', background: row.color }} />
                <span className="font-mono text-[12px]" style={{ color: row.color }}>{row.pct}%</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
