import { SeccionCabecera, tarjeta } from './ui';

const servicios = ['Exchange Demo · mock', 'Stripe · simulación'];
const noCubre = [
  { titulo: 'Oracle de producción', texto: 'Esta versión usa un mock local; no verifica páginas ni servicios reales.' },
  { titulo: 'Activos reales', texto: 'Los pagos usan MON de testnet, sin valor monetario.' },
  { titulo: 'Cobertura multicaída', texto: 'Cada contrato admite un solo evento; repetirlo requiere una instancia nueva.' }
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
        titulo="Prototipo de cobertura paramétrica por horas."
        texto="El ensayo valida reglas y pagos en Monad Testnet; el mock no constituye un oráculo de producción ni una póliza comercial."
        ancho="ancho"
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-stretch gap-[clamp(16px,2.4vw,28px)]">
        <article className={`${tarjeta} flex flex-col gap-5 p-6`}>
          <Encabezado glifo="✓" color="bg-ok" texto="Qué demuestra la demo" />
          <div className="rounded-[4px] border border-line">
            <div className="border-b border-line px-[14px] py-3 text-[14px] text-ink-2">Servicios disponibles en el prototipo</div>
            <div className="flex flex-wrap gap-2 p-[14px]">
              {servicios.map((s) => (
                <span key={s} className="flex h-10 items-center rounded-full bg-soft px-4 text-[15px]">{s}</span>
              ))}
            </div>
          </div>
          <div className="rounded-[4px] border border-line">
            <div className="border-b border-line px-[14px] py-3 text-[14px] text-ink-2">Observación de la demo</div>
            <div className="flex flex-col gap-3 p-[14px]">
              <span className="text-pretty text-[16px] leading-[1.5]">Un monitor local observa un mock cada 2 segundos y reporta tras 10 segundos continuos de caída.</span>
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
