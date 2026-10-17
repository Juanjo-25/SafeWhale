// Forma de GET /api/estado más los parámetros del contrato y el estado local de la caída.

export interface Poliza {
  id: string | number;
  dueno: string;
  servicioId: number;
  inicio: number; // ms
  fin: number; // ms
  estado: number; // 0 activa · 1 pagada · 2 expirada
  horas?: number;
  via?: 'agente' | 'bono';
  hash?: string;
  pagoMs?: number;
  buyHash?: string;
}

export type TipoEvento = 'CoverComprada' | 'CaidaReportada' | 'Pagado' | 'Reclamado' | 'Revertido' | 'Tormenta';

export interface Evento {
  tipo: TipoEvento | string;
  polizaId?: string | number | null;
  servicioId?: number;
  txHash: string | null;
  timestamp: number; // ms
  ok: boolean;
  motivo?: string;
  detalle?: string;
}

export interface Parametros {
  precioHora: number;
  indemnizacion: number;
  umbralSeg: number;
  tiempoReclamoSeg: number;
  topePorEvento: number;
  maxHoras: number;
}

export interface Tormenta {
  start: number;
  paid: boolean[];
  end: number | null;
}

export interface Estado extends Parametros {
  fondo: number;
  bono: number;
  agenteActivo: boolean;
  exchangeCaido: boolean;
  polizas: Poliza[];
  eventos: Evento[];
  fondoInicial: number;
  bonoInicial: number;
  caidaSvc: number;
  caidaInicio: number | null;
  caidaReportada: number | null;
  caidaId: number;
  storm: Tormenta | null;
  nextId: number;
}

export type MotivoRevert = 'PolizaInvalida' | 'YaPagada' | 'SinCaida';

export interface RespuestaAgente {
  text: string;
  quote?: boolean;
  horas?: number;
  svc?: number;
  prima?: string;
  pagoFijo?: string;
}
