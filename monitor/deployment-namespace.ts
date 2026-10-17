import { getAddress } from 'ethers';

export function deploymentNamespace(env: { STORAGE_BACKEND: string; STATE_NAMESPACE: string; CONTRACT_ADDRESS?: string; MONAD_CHAIN_ID: number }, address: string) {
  if (env.STORAGE_BACKEND !== 'supabase' || env.CONTRACT_ADDRESS?.toLowerCase() === address.toLowerCase()) return env.STATE_NAMESPACE;
  // Un contrato nuevo necesita su propio estado. Reintentar el mismo despliegue
  // conserva un namespace determinista y el historial del contrato anterior.
  return 'chain_' + env.MONAD_CHAIN_ID + '_' + getAddress(address).slice(2).toLowerCase();
}
