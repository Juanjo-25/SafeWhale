import { SeccionCabecera, tarjeta } from './ui';

const usos = [
  { titulo: 'Guardar la plata', texto: 'El fondo vive en el contrato, no en una cuenta nuestra.', codigo: 'fund() · fundBalance()' },
  { titulo: 'Registrar tu póliza', texto: 'Servicio y horario, públicos e inmodificables.', codigo: 'buyCover(servicio, horas)' },
  { titulo: 'Escribir las reglas del pago', texto: 'Monto fijo, una vez, solo al dueño.', codigo: 'payout(póliza)' },
  { titulo: 'Dejar constancia de la caída', texto: 'Inicio, duración y hash del reporte del monitor de demo.', codigo: 'reportOutage(inicio, duración, evidencia)' },
  { titulo: 'Garantizar al agente', texto: 'Si no paga a tiempo, cobras de su bono.', codigo: 'claimAgentFailure(póliza)' },
  { titulo: 'Que todo se pueda verificar', texto: 'Las transacciones confirmadas son públicas; los controles del mock no son operaciones on-chain.', codigo: 'testnet.monadvision.com' }
];

const razones = [
  { glifo: '10s', color: 'bg-info', titulo: 'Observación continua', texto: 'El monitor espera el umbral configurado antes de reportar la caída.' },
  { glifo: '¢', color: 'bg-ok', titulo: 'Comisiones casi nulas', texto: 'Hacen viable cobrar por hora.' },
  { glifo: '30', color: 'bg-pool', titulo: 'Tope por evento', texto: 'Hasta 30 pólizas elegibles; en testnet el agente procesa cada pago por separado.' }
];

export function Blockchain() {
  return (
    <section id="monad" className="flex scroll-mt-[100px] flex-col gap-[clamp(28px,4vw,48px)]">
      <SeccionCabecera
        eyebrow="04 · Por qué blockchain y por qué Monad"
        titulo="Las reglas del prototipo viven en el contrato."
        texto="El agente es un oráculo de confianza en esta versión: el contrato comprueba sus reglas y límites, no la veracidad externa de la caída."
      />
      <div className="flex flex-col gap-[18px]">
        <span className="text-[22px] font-medium tracking-[-0.02em]">Para qué usamos la blockchain</span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[clamp(12px,2vw,20px)]">
          {usos.map((u, i) => (
            <article key={u.titulo} className="flex flex-col gap-[10px] rounded-[24px] bg-white p-[22px] shadow-card">
              <span className="font-mono text-[13px] text-muted">{i + 1}</span>
              <h3 className="m-0 text-[20px] font-medium tracking-[-0.02em]">{u.titulo}</h3>
              <p className="m-0 text-pretty text-[15.5px] leading-[1.5] text-ink-2">{u.texto}</p>
              <div className="flex-1" />
              <span className="self-start rounded-[4px] border border-line px-[10px] py-[6px] font-mono text-[12.5px] text-ink-2">{u.codigo}</span>
            </article>
          ))}
        </div>
      </div>
      <span className="-mb-[18px] text-[22px] font-medium tracking-[-0.02em]">Y por qué Monad</span>
      <div className="grid grid-cols-1 items-stretch gap-[clamp(16px,2.4vw,28px)]">
        <article className={`${tarjeta} px-6 py-2`}>
          {razones.map((r, i) => (
            <div key={r.titulo} className={`flex items-start gap-[14px] py-5 ${i ? 'border-t border-line-soft' : ''}`}>
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-[15px] font-semibold text-white ${r.color}`}>{r.glifo}</span>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[18px]">{r.titulo}</span>
                <span className="text-[15px] leading-[1.45] text-[#4a4a4a]">{r.texto}</span>
              </div>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
