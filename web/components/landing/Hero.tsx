import Link from 'next/link';
import { HeroAnimacion } from './HeroAnimacion';
import { btnPrimario } from './ui';

const cifras = [
  ['0,01 MON', ' por hora'],
  ['0,5 MON', ' si se cae'],
  ['~1 s', ' hasta tu cuenta']
];

export function Hero() {
  return (
    <section id="inicio" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-[clamp(32px,5vw,64px)] pt-[clamp(8px,3vw,40px)]">
      <div className="flex flex-col gap-[26px]">
        <span className="flex h-8 items-center gap-2 self-start whitespace-nowrap rounded-full bg-white px-[14px] text-[13.5px] text-ink-2 shadow-hairline">
          <span className="h-[7px] w-[7px] rounded-full bg-ok" />En vivo en Monad Testnet
        </span>
        <h1 className="m-0 text-balance text-[clamp(42px,6.4vw,80px)] font-medium leading-[0.98] tracking-[-0.045em]">El seguro para tu negocio digital.</h1>
        <p className="m-0 max-w-[540px] text-pretty text-[clamp(18px,1.6vw,21px)] leading-[1.5] text-ink-2">
          Si la página, la app o el sistema de pagos del que dependes se cae, te pagan automáticamente. No llamas a nadie ni llenas formularios.
        </p>
        <div className="flex flex-wrap gap-[10px]">
          <Link href="/app" className={btnPrimario}>Abrir app</Link>
          <Link href="/app?demo=1" className="flex h-14 items-center whitespace-nowrap rounded-[4px] border border-[#d6d6d6] bg-white px-[26px] text-[17px] font-medium text-ink no-underline transition duration-150 hover:bg-[#fafafa] active:scale-[0.98]">
            Ver demo
          </Link>
        </div>
        <div className="flex flex-wrap gap-[22px] text-[14px] text-[#4a4a4a]">
          {cifras.map(([v, t]) => (
            <span key={v}><span className="font-mono text-ink">{v}</span>{t}</span>
          ))}
        </div>
      </div>
      <HeroAnimacion />
    </section>
  );
}
