import { buySimulationCover, dropSimulationExchange, restoreSimulationService, stopSimulationPayouts,
  claimSimulationCover, attackSimulationCover, stormSimulation } from './contract';
import { buyChainCover, claimChainCover, attackChainCover, controlChain, stormChain } from './chain';
import type { BackendEnvironment } from './env-schema';

export const buyCover = (env: BackendEnvironment, key: string, input: { servicioId: 1 | 2; horas: number }) =>
  env.BACKEND_MODE === 'testnet' ? buyChainCover(env, key, input) : buySimulationCover(env, key, input);
export const dropService = (env: BackendEnvironment, key: string, input: { servicioId: 1 | 2 }) =>
  env.BACKEND_MODE === 'testnet' ? controlChain(env, key, 'drop', input) : dropSimulationExchange(env, key, input);
export const restoreService = (env: BackendEnvironment, key: string, input: { servicioId: 1 | 2 }) =>
  env.BACKEND_MODE === 'testnet' ? controlChain(env, key, 'restore', input) : restoreSimulationService(env, key, input);
export const controlAgent = (env: BackendEnvironment, key: string, input: { activo?: boolean }) =>
  env.BACKEND_MODE === 'testnet' ? controlChain(env, key, 'agent', input) : stopSimulationPayouts(env, key, input.activo ?? false);
export const claimCover = (env: BackendEnvironment, key: string, input: { polizaId: string }) =>
  env.BACKEND_MODE === 'testnet' ? claimChainCover(env, key, input) : claimSimulationCover(env, key, input);
export const attackCover = (env: BackendEnvironment, key: string, input: { polizaId: string }) =>
  env.BACKEND_MODE === 'testnet' ? attackChainCover(env, key, input) : attackSimulationCover(env, key, input);
export const storm = (env: BackendEnvironment, key: string, input: { polizaIds: string[] }) =>
  env.BACKEND_MODE === 'testnet' ? stormChain(env, key, input) : stormSimulation(env, key, input);
