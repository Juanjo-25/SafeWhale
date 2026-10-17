import Link from 'next/link';
import { C } from '../colores';
import { short } from '@/hooks/formato';
import { Punto } from './Punto';

interface Props {
  demo: boolean;
  onToggleDemo: () => void;
  account: string | null;
  onConnect: () => void;
}

export function AppHeader({ demo, onToggleDemo, account, onConnect }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-3 rounded-full bg-white py-[10px] pl-[14px] pr-[10px] shadow-card">
      <Link href="/" aria-label="Ir al inicio de SafeWhale" className="flex min-w-0 flex-auto items-center gap-[10px] text-ink no-underline">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand text-[14px] font-semibold text-white">SW</div>
        <span className="text-[18px] font-semibold tracking-[-0.02em]">SafeWhale</span>
        <span className="inline border-l border-[#e4e4e4] pl-[10px] text-[14px] text-muted max-[759px]:hidden">Seguro por horas contra caídas</span>
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-10 items-center gap-2 rounded-full bg-soft px-[14px] text-[14px] text-ink-2 max-[759px]:hidden">
          <Punto color={C.green} />Monad Testnet
        </span>
        <button
          type="button"
          onClick={onToggleDemo}
          aria-pressed={demo}
          className="hit-44 flex h-10 cursor-pointer items-center gap-[10px] rounded-full border-0 bg-soft pl-[14px] pr-[6px] text-[14px] transition-transform duration-150 active:scale-[0.97]"
        >
          <span className="max-[759px]:hidden">Modo demo</span>
          <span className="hidden max-[759px]:inline">Demo</span>
          <span className="relative h-6 w-[38px] rounded-full transition-[background] duration-200 ease-[ease]" style={{ background: demo ? C.orange : '#cfcfcf' }}>
            <span
              className="absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-knob transition-transform duration-[260ms] ease-switch"
              style={{ transform: demo ? 'translateX(14px)' : 'translateX(0)' }}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={onConnect}
          className={`hit-44 h-10 cursor-pointer rounded-full border-0 bg-ink px-[18px] text-[14px] font-medium text-white transition duration-150 hover:bg-[#333] active:scale-[0.97] ${account ? 'font-mono' : 'font-sans'}`}
        >
          {account ? short(account) : 'Conectar wallet'}
        </button>
      </div>
    </header>
  );
}
