import { Interface, type Contract } from 'ethers';
import type { ParametrosContrato } from '../../shared/types';
import { ABI } from './abi';

const contractInterface = new Interface(ABI);

export async function leerParametrosContrato(contract: Pick<Contract, 'getFunction'>): Promise<ParametrosContrato & { fondo: bigint; bono: bigint }> {
  const read = async (name: string): Promise<bigint> => {
    const value: unknown = await contract.getFunction(name)();
    if (typeof value !== 'bigint') throw new Error(`Respuesta inválida de ${name}.`);
    return value;
  };
  const [precioHora, indemnizacion, stakeMinimo, carencia, tiempoReclamo, umbralSegundos,
    topePorEvento, maxHoras, plazoReporte, fondo, bono] = await Promise.all([
    read('precioHora'), read('indemnizacion'), read('stakeMinimo'), read('carencia'),
    read('tiempoReclamo'), read('umbralSegundos'), read('topePorEvento'), read('maxHoras'),
    read('plazoReporte'), read('fundBalance'), read('bondBalance'),
  ]);
  return { precioHora, indemnizacion, stakeMinimo, carencia, tiempoReclamo, umbralSegundos,
    topePorEvento, maxHoras, plazoReporte, fondo, bono };
}

export function idPolizaComprada(
  logs: readonly { address: string; topics: readonly string[]; data: string }[], address: string,
): string | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    try {
      const event = contractInterface.parseLog(log);
      if (event?.name === 'CoverComprada') return event.args.polizaId.toString();
    } catch { /* El receipt puede incluir eventos de otros tipos. */ }
  }
  return undefined;
}
