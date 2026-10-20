import { C } from '../colores';
import { Punto } from './Punto';

export interface Aviso { kind: 'warn' | 'err'; title: string; text: string }

interface Props {
  servicioCaido: boolean;
  servicioNombre: string;
  agenteActivo: boolean;
  agText: string;
  banner: Aviso | null;
  onTumbar: () => void;
  onAtacar: () => void;
  onTormenta: () => void;
  onApagar: () => void;
  disabled: boolean;
}

function BotonLab({ glifo, color, label, sub, onClick, disabled }: { glifo: string; color?: string; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[4px] border border-line bg-white p-[14px] transition duration-150 hover:bg-[#fafafa] active:scale-[0.98] disabled:cursor-default disabled:opacity-40"
    >
      <span className="text-[22px] leading-none" style={{ color }}>{glifo}</span>
      <span className="text-[14px] font-medium">{label}</span>
      <span className="text-center text-[12.5px] text-muted">{sub}</span>
    </button>
  );
}

function Pastilla({ dot, texto }: { dot: string; texto: string }) {
  return (
    <span className="flex h-8 items-center gap-[7px] rounded-full bg-soft px-3 text-[13px]">
      <Punto color={dot} />{texto}
    </span>
  );
}

export function DemoLab({ servicioCaido, servicioNombre, agenteActivo, agText, banner, onTumbar, onAtacar, onTormenta, onApagar, disabled }: Props) {
  return (
    <section aria-label="Laboratorio de demo" className="flex flex-col gap-4 rounded-[28px] bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[17px] font-medium">Laboratorio de demo</span>
        <div className="flex flex-wrap gap-2">
          <Pastilla dot={servicioCaido ? C.red : C.green} texto={servicioCaido ? servicioNombre + ' caído' : servicioNombre + ' disponible'} />
          <Pastilla dot={agenteActivo ? C.green : C.gray} texto={agText} />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-[10px]">
        <BotonLab glifo="↓" color={C.red} label={servicioCaido ? 'Restaurar servicio' : 'Tumbar servicio'} sub={servicioCaido ? 'Recupera el mock local' : 'Activa una caída del mock'} onClick={onTumbar} disabled={disabled} />
        <BotonLab glifo="×" label="Atacar al agente" sub="Comprueba un payout inválido" onClick={onAtacar} disabled={disabled} />
        <BotonLab glifo="⁂" color={C.blue} label="Modo Tormenta" sub="Hasta 30 pagos con receipt" onClick={onTormenta} disabled={disabled} />
        <BotonLab glifo="○" label={agenteActivo ? 'Apagar pagos' : 'Habilitar pagos'} sub={agenteActivo ? 'El monitor sigue reportando' : 'Reactiva payouts del monitor'} onClick={onApagar} disabled={disabled} />
      </div>
      {banner && (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-[4px] border border-line px-4 py-[14px]">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[14px] font-semibold text-white" style={{ background: banner.kind === 'err' ? C.red : C.orange }}>!</span>
          <div className="flex flex-col gap-[2px] text-[15px] leading-[1.45]">
            <span className="font-mono text-[14px] font-medium">{banner.title}</span>
            <span className="text-pretty text-ink-2">{banner.text}</span>
          </div>
        </div>
      )}
    </section>
  );
}
