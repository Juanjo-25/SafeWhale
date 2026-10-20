import type { Address, ConstructorArgs, DespliegueContrato, ParametrosContrato } from './types';
import deployment from './deployment.json';

// Configuración pública de red; no contiene secretos ni prueba conectividad.
export const MONAD_TESTNET = {
  id: 10143,
  chainId: '0x279f',
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadvision.com'],
};

export const CONTRACT_LIMITS = { servicioId: 1, maxPolizasConReserva: 30 } as const;

// Referencia para el próximo despliegue; todavía no son lecturas on-chain.
export const DEMO_CONTRACT_PARAMETERS = {
  precioHora: 1_000_000_000_000_000n,
  indemnizacion: 10_000_000_000_000_000n,
  stakeMinimo: 300_000_000_000_000_000n,
  carencia: 0n,
  tiempoReclamo: 30n,
  umbralSegundos: 10n,
  topePorEvento: 30n,
  maxHoras: 24n,
  plazoReporte: 120n,
} as const satisfies ParametrosContrato;

export const DEMO_FUNDING = { fondo: 1_000_000_000_000_000_000n, bono: 500_000_000_000_000_000n } as const;

// Completar solo después de confirmar el receipt de despliegue.
const publishedDeployment = deployment as { chainId: number; address: string; bloque: number } | null;
export const CONTRACT_DEPLOYMENT: DespliegueContrato | null = publishedDeployment ? {
  chainId: publishedDeployment.chainId, address: publishedDeployment.address as Address, bloque: BigInt(publishedDeployment.bloque),
} : null;

export function demoConstructorArgs(agent: Address): ConstructorArgs {
  const p = DEMO_CONTRACT_PARAMETERS;
  return [agent, p.precioHora, p.indemnizacion, p.stakeMinimo, p.carencia,
    p.tiempoReclamo, p.umbralSegundos, p.topePorEvento, p.maxHoras, p.plazoReporte];
}
