export interface FilaPoliza { id: number; horas: string; estadoLabel: string; rango: string; color: string; amount: string; amountColor: string }
export interface FilaEvento { titulo: string; titleColor: string; detalle: string; hora: string; dot: string; url: string; hashShort: string }

interface Props {
  oculta: boolean;
  tab: 'pol' | 'ev';
  onTab: (t: 'pol' | 'ev') => void;
  polizas: FilaPoliza[];
  eventos: FilaEvento[];
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`hit-44 h-[34px] cursor-pointer rounded-full border-0 px-[14px] text-[14px] transition-colors duration-150 ${activa ? 'bg-soft' : 'bg-transparent'}`}
    >
      {children}
    </button>
  );
}

export function ActividadCard({ oculta, tab, onTab, polizas, eventos }: Props) {
  return (
    <section aria-label="Mis pólizas y eventos" className={`flex flex-auto flex-col rounded-[28px] bg-white px-[22px] pb-[10px] pt-2 shadow-card ${oculta ? 'max-[759px]:hidden' : ''}`}>
      <div role="tablist" className="flex gap-1 pb-[6px] pt-3">
        <Pestana activa={tab === 'pol'} onClick={() => onTab('pol')}>Mis pólizas</Pestana>
        <Pestana activa={tab === 'ev'} onClick={() => onTab('ev')}>Eventos on-chain</Pestana>
      </div>
      {tab === 'pol' && (
        <div className="flex flex-col">
          {!polizas.length && <span className="py-4 text-[15px] text-muted">Todavía no tienes pólizas.</span>}
          {polizas.map((p) => (
            <div key={p.id} className="flex items-center gap-[14px] border-t border-line-soft py-[14px]">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full font-mono text-[13px] text-white" style={{ background: p.color }}>#{p.id}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px]">{p.horas} · {p.estadoLabel}</span>
                <span className="font-mono text-[13px] text-muted">{p.rango}</span>
              </div>
              <span className="whitespace-nowrap font-mono text-[14px]" style={{ color: p.amountColor }}>{p.amount}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'ev' && (
        <div className="flex flex-col">
          {!eventos.length && <span className="py-4 text-[15px] text-muted">Cada acción del contrato aparece aquí.</span>}
          {eventos.map((e, i) => (
            <a key={i} href={e.url} target="_blank" rel="noopener" className="flex gap-[14px] border-t border-line-soft py-[14px] text-ink transition-opacity duration-150 hover:opacity-75">
              <span className="mt-[6px] h-[10px] w-[10px] flex-none rounded-full" style={{ background: e.dot }} />
              <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <div className="flex justify-between gap-[10px]">
                  <span className="text-[15.5px]" style={{ color: e.titleColor }}>{e.titulo}</span>
                  <span className="whitespace-nowrap font-mono text-[12.5px] text-muted">{e.hora}</span>
                </div>
                <span className="text-pretty text-[13.5px] leading-[1.4] text-[#4a4a4a]">{e.detalle}</span>
                <span className="font-mono text-[12.5px] text-[#8a8a8a]">{e.hashShort} ↗</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
