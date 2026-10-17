import { z } from 'zod';
import type { Estado, Poliza } from './tipos';

const id = z.string().regex(/^(0|[1-9]\d*)$/);
const amount = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/).transform(Number).refine(Number.isFinite);
const seconds = z.number().int().nonnegative().max(Math.floor(Number.MAX_SAFE_INTEGER / 1000));
export const policyApiSchema = z.object({ id, dueno: z.string(), servicioId: z.number().int().positive(),
  inicio: seconds, fin: seconds, estado: z.enum(['Activa', 'Pagada', 'Expirada']),
});
const stateSchema = z.object({
  modo: z.enum(['simulado', 'testnet']), chainId: z.number(), contrato: z.string().nullable(), cuentaDemo: z.string(),
  autorizado: z.boolean().default(true), compraHabilitada: z.boolean().optional(),
  caidasPagables: z.record(z.string(), z.string()).default({}), exposicionTotal: amount.optional(),
  caida: z.object({ id: z.string(), inicio: seconds, reportadoEn: seconds, duracionSegundos: z.number(), pagosRealizados: z.number() }).nullable().optional(),
  monitor: z.object({ ultimaRevision: seconds.nullable(), error: z.string().nullable() }).optional(),
  fondo: amount, bono: amount, agenteActivo: z.boolean(), exchangeCaido: z.boolean(), caidaIniciadaEn: seconds.nullable(),
  parametros: z.object({ precioHora: amount, indemnizacion: amount, umbralSeg: z.number().positive(),
    tiempoReclamoSeg: z.number().positive(), topePorEvento: z.number().int().positive(), maxHoras: z.number().int().positive() }),
  servicios: z.array(z.object({ id: z.number().int(), nombre: z.string(), tipo: z.string(), caido: z.boolean(), caidaIniciadaEn: seconds.nullable() })),
  polizas: z.array(policyApiSchema),
  eventos: z.array(z.object({ id: z.string(), tipo: z.string(), polizaId: id.nullable(),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable(), timestamp: seconds, ok: z.boolean(), motivo: z.string().nullable(),
    origen: z.enum(['simulado', 'testnet']), servicioId: z.number().int().optional(),
  })),
});

export interface EstadoFrontend extends Estado {
  modo: 'simulado' | 'testnet' | null;
  cuentaDemo: string | null;
  servicios: { id: number; nombre: string; tipo: string; caido: boolean; caidaIniciadaEn: number | null }[];
  autorizado: boolean;
  compraHabilitada: boolean;
  caidasPagables: Record<string, string>;
  exposicionContrato: number | null;
  monitor: { ultimaRevision: number | null; error: string | null } | null;
}

export const EMPTY_STATE: EstadoFrontend = {
  precioHora: 0, indemnizacion: 0, umbralSeg: 10, tiempoReclamoSeg: 30, topePorEvento: 30, maxHoras: 24,
  fondo: 0, bono: 0, fondoInicial: 0, bonoInicial: 0, agenteActivo: false, exchangeCaido: false,
  polizas: [], eventos: [], caidaSvc: 1, caidaInicio: null, caidaReportada: null, caidaId: 0, storm: null, nextId: 1,
  modo: null, cuentaDemo: null, servicios: [], autorizado: true, compraHabilitada: true, caidasPagables: {}, exposicionContrato: null, monitor: null,
};

export function mapPolicy(input: unknown): Poliza {
  const policy = policyApiSchema.parse(input);
  return { ...policy, inicio: policy.inicio * 1000, fin: policy.fin * 1000,
    horas: (policy.fin - policy.inicio) / 3600, estado: { Activa: 0, Pagada: 1, Expirada: 2 }[policy.estado],
  };
}

export function mapState(input: unknown): EstadoFrontend {
  const data = stateSchema.parse(input);
  const eventos = data.eventos.map((event) => ({ ...event, timestamp: event.timestamp * 1000,
    motivo: event.motivo ?? undefined,
    detalle: !event.txHash ? (event.origen === 'simulado' ? 'Simulación o control local · sin transacción on-chain' : 'Comprobación del contrato · sin transacción enviada') : 'Transacción confirmada',
  })).reverse();
  const report = eventos.find((event) => event.tipo === 'CaidaReportada');
  return { ...EMPTY_STATE, ...data.parametros,
    modo: data.modo, cuentaDemo: data.cuentaDemo, servicios: data.servicios, fondo: data.fondo, bono: data.bono,
    autorizado: data.autorizado, compraHabilitada: data.compraHabilitada ?? !data.exchangeCaido,
    caidasPagables: data.caidasPagables, exposicionContrato: data.exposicionTotal ?? null, monitor: data.monitor ?? null,
    fondoInicial: data.fondo, bonoInicial: data.bono, agenteActivo: data.agenteActivo, exchangeCaido: data.exchangeCaido,
    polizas: data.polizas.map((policy) => {
      const mapped = mapPolicy(policy);
      const purchase = eventos.find((event) => event.polizaId === policy.id && event.tipo === 'CoverComprada');
      const payment = eventos.find((event) => event.polizaId === policy.id && ['Pagado', 'Reclamado'].includes(event.tipo));
      return { ...mapped, buyHash: purchase?.txHash ?? undefined, hash: payment?.txHash ?? undefined,
        via: payment ? (payment.tipo === 'Reclamado' ? 'bono' as const : 'agente' as const) : undefined,
      };
    }).reverse(), eventos, caidaInicio: data.caidaIniciadaEn === null ? null : data.caidaIniciadaEn * 1000,
    caidaReportada: data.caida?.reportadoEn ? data.caida.reportadoEn * 1000 : report?.timestamp ?? null,
  };
}

export const explorerLink = (hash?: string | null) => hash && /^0x[a-fA-F0-9]{64}$/.test(hash) ? 'https://testnet.monadvision.com/tx/' + hash : '';
