import type { RefObject } from 'react';
import { C } from '../colores';
import { mon, svcName } from '@/hooks/formato';
import { Punto } from './Punto';

export interface Mensaje { role: 'agent' | 'user'; text: string; quote?: boolean; horas?: number; svc?: number; done?: boolean }

const CHIPS = ['Cúbreme Wompi 8 horas', '¿Cómo me pagan?', '¿Puedes cubrir mi web?'];

interface Props {
  abierto: boolean;
  agenteActivo: boolean;
  agText: string;
  mensajes: Mensaje[];
  escribiendo: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  servicio: number;
  precioHora: number;
  comprando: boolean;
  mensajeOcupado: number | null;
  input: string;
  onInput: (v: string) => void;
  onEnviar: (texto: string) => void;
  onCerrar: () => void;
  onConfirmar: (indice: number) => void;
}

function Cotizacion({ m, i, p }: { m: Mensaje; i: number; p: Props }) {
  const ocupado = p.comprando && p.mensajeOcupado === i;
  return (
    <div className="w-[min(100%,320px)] rounded-[4px] border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-[14px] py-3">
        <span className="text-[14px]">{m.horas} h · {svcName(m.svc || p.servicio)}</span>
        <span className="font-mono text-[14px]">{mon(p.precioHora * (m.horas || 0))}</span>
      </div>
      <button
        type="button"
        onClick={() => p.onConfirmar(i)}
        disabled={!!m.done || p.comprando}
        className="h-[46px] w-full cursor-pointer border-0 bg-transparent px-[14px] text-left text-[15px] transition-colors duration-150 hover:bg-[#fafafa]"
        style={{ color: m.done ? C.green : C.orange }}
      >
        {m.done ? 'Póliza comprada ✓' : ocupado ? 'Confirma en MetaMask…' : 'Confirmar y pagar'}
      </button>
    </div>
  );
}

export function ChatPanel(p: Props) {
  const { abierto } = p;
  return (
    <section
      aria-label="Chat con el agente"
      aria-hidden={!abierto}
      className="fixed bottom-[106px] left-auto right-[28px] z-[60] flex h-[min(620px,calc(100dvh_-_140px))] w-[min(400px,calc(100vw_-_56px))] origin-bottom-right flex-col overflow-hidden rounded-[28px] bg-[rgba(255,255,255,0.92)] shadow-chat backdrop-blur-[24px] backdrop-saturate-[1.8] max-[759px]:bottom-[calc(8px_+_env(safe-area-inset-bottom))] max-[759px]:left-2 max-[759px]:right-2 max-[759px]:h-[calc(100dvh_-_16px_-_env(safe-area-inset-bottom))] max-[759px]:w-auto"
      style={{
        transform: abierto ? 'scale(1) translateY(0)' : 'scale(0.6) translateY(40px)',
        opacity: abierto ? 1 : 0,
        pointerEvents: abierto ? 'auto' : 'none',
        visibility: abierto ? 'visible' : 'hidden',
        transition: 'transform 380ms cubic-bezier(.2,1.1,.3,1), opacity 220ms ease, visibility 0s linear ' + (abierto ? '0s' : '380ms')
      }}
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-[22px] py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">IA</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[17px]">Agente SafeWhale</span>
          <span className="flex items-center gap-[6px] text-[13.5px] text-muted"><Punto color={p.agenteActivo ? C.green : C.gray} />{p.agText}</span>
        </div>
        <button
          type="button"
          onClick={p.onCerrar}
          aria-label="Cerrar chat"
          className="hit-44 h-10 w-10 flex-none cursor-pointer rounded-full border-0 bg-soft text-[18px] transition duration-150 hover:bg-[#e9e9e9] active:scale-[0.94]"
        >
          ×
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={p.scrollRef} role="log" aria-live="polite" className="absolute inset-0 flex flex-col gap-[10px] overflow-y-auto p-[18px]">
          {p.mensajes.map((m, i) => {
            const user = m.role === 'user';
            return (
              <div key={i} className={`flex flex-col gap-2 ${user ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[min(82%,460px)] whitespace-pre-wrap text-pretty px-[15px] py-[10px] text-[15.5px] leading-[1.45] ${user ? 'rounded-[20px_20px_6px_20px] bg-brand text-white' : 'rounded-[20px_20px_20px_6px] bg-soft text-ink'}`}
                >
                  {m.text}
                </div>
                {m.quote && <Cotizacion m={m} i={i} p={p} />}
              </div>
            );
          })}
          {p.escribiendo && (
            <span className="self-start rounded-[20px_20px_20px_6px] bg-soft px-[15px] py-[10px] text-[15px] text-muted">Escribiendo…</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-[10px] border-t border-line-soft px-4 pb-4 pt-3">
        <div className="flex gap-2 overflow-x-auto">
          {CHIPS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => p.onEnviar(label)}
              className="h-9 flex-none cursor-pointer whitespace-nowrap rounded-full border-0 bg-soft px-[14px] text-[14px] transition duration-150 hover:bg-[#e9e9e9] active:scale-[0.97]"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label htmlFor="sw-msg" className="sr-only-label">Mensaje al agente</label>
          <input
            id="sw-msg"
            value={p.input}
            onChange={(e) => p.onInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') p.onEnviar(p.input); }}
            placeholder="Escríbele al agente…"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-[4px] border border-line bg-white px-4 text-[16px] outline-none focus:border-ink focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => p.onEnviar(p.input)}
            aria-label="Enviar"
            className="h-12 w-12 flex-none cursor-pointer rounded-[4px] border-0 bg-ink text-[18px] text-white transition-transform duration-150 active:scale-[0.95]"
          >
            ↑
          </button>
        </div>
      </div>
    </section>
  );
}
