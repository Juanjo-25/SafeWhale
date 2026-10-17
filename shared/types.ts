// ethers conserva uint256 como bigint, en wei o segundos.
export type Address = `0x${string}`;
export type Bytes32 = `0x${string}`;

export enum EstadoPoliza { Activa = 0, Pagada = 1, Expirada = 2 }

export interface PolizaOnChain {
  id: bigint;
  dueno: Address;
  servicioId: bigint;
  inicio: bigint;
  fin: bigint;
  estado: bigint; // ABI: uint8; valores de EstadoPoliza.
}

export interface CaidaOnChain {
  id: bigint;
  servicioId: bigint;
  inicio: bigint;
  reportadoEn: bigint;
  duracionSegundos: bigint;
  evidenciaHash: Bytes32;
  pagosRealizados: bigint;
}

export interface ParametrosContrato {
  precioHora: bigint;
  indemnizacion: bigint;
  stakeMinimo: bigint;
  carencia: bigint;
  tiempoReclamo: bigint;
  umbralSegundos: bigint;
  topePorEvento: bigint;
  maxHoras: bigint;
  plazoReporte: bigint;
}

// Orden exacto del constructor en shared/abi.json.
export type ConstructorArgs = readonly [
  agent: Address, precioHora: bigint, indemnizacion: bigint, stakeMinimo: bigint,
  carencia: bigint, tiempoReclamo: bigint, umbralSegundos: bigint,
  topePorEvento: bigint, maxHoras: bigint, plazoReporte: bigint,
];

export interface DespliegueContrato { chainId: number; address: Address; bloque: bigint }

// JSON: IDs decimales, timestamps Unix en segundos y estados legibles.
// La UI convierte a milisegundos solamente al presentar los datos.
export interface PolizaJSON {
  id: string;
  dueno: string;
  servicioId: number;
  inicio: number;
  fin: number;
  estado: keyof typeof EstadoPoliza;
}

export interface ParametrosJSON {
  precioHora: string; // MON decimal.
  indemnizacion: string;
  umbralSeg: number;
  tiempoReclamoSeg: number;
  topePorEvento: number;
  maxHoras: number;
}
