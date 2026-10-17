import Link from 'next/link';

export function Cierre() {
  return (
    <>
      <section className="flex flex-col items-center gap-[22px] rounded-[36px] bg-ink p-[clamp(32px,6vw,72px)] text-center text-white">
        <h2 className="m-0 max-w-[820px] text-balance text-[clamp(34px,5vw,64px)] font-medium leading-none tracking-[-0.04em]">Tu próximo día de ventas, cubierto.</h2>
        <p className="m-0 max-w-[560px] text-[18px] leading-[1.5] text-[rgba(255,255,255,0.78)]">Elige el servicio del que dependes, las horas, y vende tranquilo.</p>
        <div className="flex flex-wrap justify-center gap-[10px]">
          <Link href="/app" className="flex h-14 items-center whitespace-nowrap rounded-[4px] bg-brand px-7 text-[17px] font-medium text-white no-underline transition duration-150 hover:bg-brand-hover hover:text-white active:scale-[0.98]">
            Abrir app
          </Link>
          <Link href="/app?demo=1" className="flex h-14 items-center whitespace-nowrap rounded-[4px] border border-[rgba(255,255,255,0.3)] px-7 text-[17px] font-medium text-white no-underline transition duration-150 hover:bg-[rgba(255,255,255,0.08)] hover:text-white active:scale-[0.98]">
            Ver demo
          </Link>
        </div>
      </section>
      <footer className="flex flex-wrap justify-between gap-4 pb-3 text-[13.5px] text-ink-2">
        <span>SafeWhale · Hackathon Monad, Medellín 2026</span>
        <span className="max-w-[640px] text-pretty">Prototipo en testnet. La caída de la demo es simulada, las primas no son actuariales y no es un producto regulado.</span>
      </footer>
    </>
  );
}
