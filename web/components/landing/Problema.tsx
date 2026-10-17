import { SeccionCabecera, tarjeta } from './ui';

const cifras = [
  { valor: 'US$500–650 M', texto: 'perdieron empresas de EE. UU. en la caída de AWS del 20 oct. 2025.', fuente: 'Fuente: Parametrix ↗', url: 'https://www.parametrixinsurance.com/blog/aws-us-east-1-outage-what-parametrix-monitored-in-real-time' },
  { valor: '~70.000', texto: 'organizaciones afectadas en esa misma falla de ~15 horas.', fuente: 'Fuente: OutageCost ↗', url: 'https://outagecost.com/aws-outages' },
  { valor: '0 pesos', texto: 'en efectivo te devuelve la nube: paga con créditos, no con plata.', fuente: 'Fuente: The Pricer, sobre el SLA de AWS ↗', url: 'https://www.thepricer.org/how-much-did-the-aws-outage-cost-businesses/' }
];

export function Problema() {
  return (
    <section id="problema" className="flex scroll-mt-[100px] flex-col gap-[clamp(28px,4vw,48px)]">
      <SeccionCabecera
        eyebrow="01 · El problema"
        titulo="Cuando se cae lo que usas, dejas de vender. Y nadie te paga."
        texto="Tu negocio corre sobre la nube, la pasarela y la app de otros. Si una falla, tú pierdes las ventas."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[clamp(16px,2.4vw,28px)]">
        {cifras.map((c) => (
          <article key={c.valor} className={`${tarjeta} flex flex-col gap-3 px-6 pb-[22px] pt-7`}>
            <span className="font-mono text-[clamp(36px,4vw,46px)] leading-none tracking-[-0.03em]">{c.valor}</span>
            <span className="text-pretty text-[17px] leading-[1.45]">{c.texto}</span>
            <div className="flex-1" />
            <a href={c.url} target="_blank" rel="noopener" className="border-t border-line-soft pt-3 text-[13.5px] text-[oklch(0.62_0.17_55)] hover:text-[oklch(0.55_0.17_55)] hover:underline">
              {c.fuente}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
