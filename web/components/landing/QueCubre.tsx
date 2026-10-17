import { SeccionCabecera, tarjeta } from './ui';

const servicios = ['Stripe', 'AWS', 'Shopify', 'Mastercard', 'Wompi'];
const ciudades = ['Bogotá ✕', 'São Paulo ✕', 'Virginia ✕'];
const noCubre = [
  { titulo: 'Tu propia web', texto: 'Podrías apagarla tú y cobrar.' },
  { titulo: 'Fallas parciales o subjetivas', texto: '“Estaba lento” no se puede probar.' },
  { titulo: 'Sistemas privados', texto: 'Nadie de afuera puede confirmar la caída.' }
];

function Encabezado({ glifo, color, texto }: { glifo: string; color: string; texto: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-[17px] text-white ${color}`}>{glifo}</span>
      <span className="text-[22px] font-medium tracking-[-0.02em]">{texto}</span>
    </div>
  );
}

export function QueCubre() {
  return (
    <section id="cubre" className="flex scroll-mt-[100px] flex-col gap-[clamp(28px,4vw,48px)]">
      <SeccionCabecera
        eyebrow="03 · Qué cubre"
        titulo="Paga por un dato medible, no por “cuánto perdiste”."
        texto="Seguro paramétrico: solo cubre caídas que se miden de forma objetiva."
        ancho="ancho"
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-stretch gap-[clamp(16px,2.4vw,28px)]">
        <article className={`${tarjeta} flex flex-col gap-5 p-6`}>
          <Encabezado glifo="✓" color="bg-ok" texto="Dónde sí funciona" />
          <div className="rounded-[4px] border border-line">
            <div className="border-b border-line px-[14px] py-3 text-[14px] text-ink-2">Servicios grandes con página de estado pública</div>
            <div className="flex flex-wrap gap-2 p-[14px]">
              {servicios.map((s) => (
                <span key={s} className="flex h-10 items-center rounded-full bg-soft px-4 text-[15px]">{s}</span>
              ))}
            </div>
          </div>
          <div className="rounded-[4px] border border-line">
            <div className="border-b border-line px-[14px] py-3 text-[14px] text-ink-2">Servicios que se pueden revisar desde afuera</div>
            <div className="flex flex-col gap-3 p-[14px]">
              <span className="text-pretty text-[16px] leading-[1.5]">Monitores en varias ciudades preguntan cada minuto “¿estás vivo?”.</span>
              <div className="flex flex-wrap gap-[6px] font-mono text-[12.5px]">
                {ciudades.map((c) => (
                  <span key={c} className="rounded-full bg-[oklch(0.95_0.04_25)] px-[10px] py-1 text-[oklch(0.45_0.15_25)]">{c}</span>
                ))}
                <span className="rounded-full bg-ink px-[10px] py-1 text-white">3/3 → caída</span>
              </div>
            </div>
          </div>
        </article>
        <article className={`${tarjeta} flex flex-col gap-5 p-6`}>
          <Encabezado glifo="✕" color="bg-bad" texto="Dónde no funciona" />
          <div className="flex flex-col">
            {noCubre.map((n, i) => (
              <div key={n.titulo} className={`flex flex-col gap-1 py-4 ${i ? 'border-t border-line-soft' : ''}`}>
                <span className="text-[18px]">{n.titulo}</span>
                <span className="text-pretty text-[15.5px] leading-[1.5] text-ink-2">{n.texto}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
