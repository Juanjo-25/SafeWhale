import Link from 'next/link';

const enlaces = [
  { href: '#como', label: 'Cómo funciona' },
  { href: '#monad', label: 'Blockchain' },
  { href: '#comparar', label: 'Comparar' }
];

export function LandingHeader() {
  return (
    <header className="sticky top-[clamp(10px,2vw,20px)] z-40 flex items-center gap-3 rounded-full bg-[rgba(255,255,255,0.82)] py-[10px] pl-[14px] pr-[10px] shadow-nav backdrop-blur-[20px] backdrop-saturate-[1.8]">
      <a href="#inicio" className="flex min-w-0 flex-auto items-center gap-[10px] text-ink no-underline">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand text-[14px] font-semibold text-white">SW</span>
        <span className="text-[18px] font-semibold tracking-[-0.02em]">SafeWhale</span>
      </a>
      <nav aria-label="Secciones" className="hidden gap-1 min-[1060px]:flex">
        {enlaces.map((e) => (
          <a key={e.href} href={e.href} className="hit-44 flex h-10 items-center whitespace-nowrap rounded-full px-[14px] text-[14px] text-ink-2 no-underline transition-colors duration-150 hover:bg-soft">
            {e.label}
          </a>
        ))}
      </nav>
      <Link href="/app" className="hit-44 flex h-10 items-center whitespace-nowrap rounded-full bg-ink px-[18px] text-[14px] font-medium text-white no-underline transition duration-150 hover:bg-[#333] hover:text-white active:scale-[0.97]">
        Abrir app
      </Link>
    </header>
  );
}
