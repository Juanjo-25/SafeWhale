import type { RefObject } from 'react';
import { SVCS } from '@/hooks/formato';

interface Props {
  oculta: boolean;
  servicio: number;
  onServicio: (id: number) => void;
  horasRef: RefObject<HTMLInputElement | null>;
  horasInput: string;
  maxHoras: number;
  onHoras: (valor: string) => void;
  enfocado: boolean;
  onFoco: (enfocado: boolean) => void;
  primaLabel: string;
  indemLabel: string;
  comprando: boolean;
  onComprar: () => void;
  comprarLabel: string;
}

export function CompraCard(p: Props) {
  return (
    <section aria-label="Comprar cobertura" className={`flex flex-col gap-[14px] rounded-[28px] bg-white p-6 shadow-card ${p.oculta ? 'max-[759px]:hidden' : ''}`}>
      <div className="flex flex-col gap-2">
        <span className="text-[14px]">Servicio del que dependes</span>
        <div role="radiogroup" aria-label="Servicio" className="flex flex-wrap gap-2">
          {SVCS.map((x) => {
            const on = p.servicio === x.id;
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => p.onServicio(x.id)}
                className={`hit-44 h-10 cursor-pointer rounded-full border-0 px-4 text-[14.5px] transition duration-150 active:scale-[0.96] ${on ? 'bg-ink text-white' : 'bg-soft text-ink'}`}
              >
                {x.n}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`flex flex-col gap-2 rounded-[4px] border px-[18px] py-[14px] transition-[border-color] duration-150 ease-[ease] ${p.enfocado ? 'border-ink' : 'border-line'}`}>
        <div className="flex flex-wrap justify-between gap-[10px] text-[14px]">
          <label htmlFor="sw-horas">Horas a cubrir</label>
          <span>Prima: <span className="font-mono">{p.primaLabel}</span></span>
        </div>
        <div className="flex items-center gap-[10px]">
          <input
            id="sw-horas"
            ref={p.horasRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={p.maxHoras}
            value={p.horasInput}
            onChange={(e) => p.onHoras(e.target.value)}
            onFocus={() => p.onFoco(true)}
            onBlur={() => p.onFoco(false)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[22px] text-ink outline-none focus-visible:outline-none"
          />
          <span className="text-[17px] font-medium">h</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-[10px] px-[2px] text-[14px] text-muted">
        <span>Pago si se cae: <span className="font-mono text-ink">{p.indemLabel}</span></span>
        <span>Máx. <span className="font-mono">{p.maxHoras} h</span></span>
      </div>
      <button
        type="button"
        onClick={p.onComprar}
        disabled={p.comprando}
        className="h-[52px] cursor-pointer rounded-[4px] border-0 bg-brand text-[16px] font-medium text-white transition duration-150 hover:bg-brand-hover active:scale-[0.98]"
      >
        {p.comprarLabel}
      </button>
    </section>
  );
}
