import 'server-only';
import type { BackendEnvironment } from './env-schema';
import { ApiError } from './api';
import { withChainStore } from './chain-store';
import { readSimulationSnapshot } from './state';
import { serviceName } from './services';

// Una fuente común para la ruta HTTP y el daemon que observa el mock en DB.
export async function readExchangeAvailability(env: BackendEnvironment, servicioId: 1 | 2) {
  let disponible: boolean; let caidaDesde: number | null;
  if (env.BACKEND_MODE === 'testnet') {
    if (servicioId !== 1) throw new ApiError('ServicioInvalido', 'El contrato solo admite el servicio 1.', 409);
    const controls = await withChainStore(env, async (state) => ({ ...state.controls }));
    disponible = !controls.caido; caidaDesde = controls.caidaDesde;
  } else {
    const state = await readSimulationSnapshot(env.STATE_FILE, env);
    disponible = !state.servicios[servicioId].caido; caidaDesde = state.servicios[servicioId].caidaIniciadaEn;
  }
  return { status: disponible ? 200 : 503, body: { modo: env.BACKEND_MODE,
    servicioId, nombre: serviceName(servicioId), disponible, caidaDesde } };
}
