export type TabMovil = 'poliza' | 'pool' | 'act';

const TABS: [TabMovil, string, string][] = [['poliza', '◎', 'Póliza'], ['pool', '▤', 'Pool'], ['act', '≡', 'Actividad']];

interface Props { actual: TabMovil; alerta: boolean; onCambiar: (t: TabMovil) => void }

/** Barra de pestañas flotante (solo < 760px). */
export function TabsMovil({ actual, alerta, onCambiar }: Props) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed bottom-[calc(12px_+_env(safe-area-inset-bottom))] left-3 right-3 z-50 hidden gap-1 rounded-full border border-[rgba(255,255,255,0.6)] bg-[rgba(255,255,255,0.78)] p-[6px] shadow-tabbar backdrop-blur-[20px] backdrop-saturate-[1.8] max-[759px]:flex"
    >
      {TABS.map(([id, glyph, label]) => {
        const on = actual === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onCambiar(id)}
            aria-current={on ? 'page' : undefined}
            className={`relative flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-full border-0 transition-[background,color,transform] duration-200 ease-[ease] active:scale-[0.96] ${on ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}
          >
            <span className="text-[17px] leading-none">{glyph}</span>
            <span className="text-[11.5px] font-medium">{label}</span>
            {id === 'poliza' && alerta && !on && (
              <span aria-label="Caída en curso" className="absolute right-[calc(50%-16px)] top-2 h-[7px] w-[7px] rounded-full bg-bad" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
