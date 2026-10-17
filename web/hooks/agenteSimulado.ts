import { SVCS, svcName } from './formato';
import type { RespuestaAgente } from './tipos';

interface Contexto { maxHoras: number; servicio: number; reclamoSeg: number }

// Mismas reglas que el agente de la referencia: detecta servicio y horas, explica el pago y el bono,
// y rechaza cubrir la web propia.
export function responder(text: string, { maxHoras, servicio, reclamoSeg }: Contexto): RespuestaAgente {
  const t = text.toLowerCase();
  const m = t.match(/(\d+)/);
  if (m || /cubr|compr|segur|p[oó]liza|quiero/.test(t)) {
    const h = Math.min(maxHoras, Math.max(1, m ? parseInt(m[1], 10) : 8));
    const found = SVCS.find((x) => t.includes(x.n.toLowerCase()));
    const svc = found ? found.id : servicio;
    return { text: 'Te propongo ' + h + (h === 1 ? ' hora' : ' horas') + ' sobre ' + svcName(svc) + '. Confirma y pagas la prima.', quote: true, horas: h, svc };
  }
  if (/propia|mi web|mi p[aá]gina|mi servidor/.test(t)) return { text: 'Tu propia web no la puedo cubrir: si fuera así, cualquiera podría apagar su servidor y cobrar. Cubro servicios de terceros que se pueden revisar desde afuera, como Stripe, AWS, Shopify, Mastercard o Wompi.' };
  if (/c[oó]mo|pag|funciona/.test(t)) return { text: 'Le pregunto al servicio cada minuto si está vivo, desde varios lugares. Si no responde más del umbral, reporto la caída al contrato en Monad y llamo a payout. El contrato solo permite un pago fijo, una vez por póliza y siempre a tu dirección.' };
  if (/apag|hack|bono|conf/.test(t)) return { text: 'El dinero no está conmigo, está en el contrato. Y dejé un bono: si reporto una caída y no te pago en ' + reclamoSeg + ' s, cobras directo de ese bono.' };
  return { text: 'Vendo cobertura por horas contra caídas de servicios como Stripe, AWS, Shopify, Mastercard o Wompi. Dime cuál y cuántas horas, por ejemplo "cúbreme Wompi 8 horas".' };
}
