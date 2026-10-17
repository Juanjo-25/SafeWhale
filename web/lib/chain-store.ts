import { z } from 'zod';
import type { BackendEnvironment } from './env-schema';
import { withStateStore } from './store';
import { Wallet, getAddress } from 'ethers';
import { ApiError } from './api';

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const operation = z.object({ fingerprint: z.string(), action: z.string(), input: z.record(z.string(), z.unknown()),
  actor: z.enum(['user', 'agent', 'control']), status: z.enum(['prepared', 'confirmed', 'reverted', 'rejected']),
  hash: hash.optional(), raw: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(), nonce: z.number().int().nonnegative().optional(),
  started: z.number(), result: z.record(z.string(), z.unknown()).optional(), error: z.string().optional(),
});
const event = z.object({ id: z.string(), tipo: z.string(), polizaId: z.string().nullable(), servicioId: z.number().optional(),
  txHash: hash.nullable(), timestamp: z.number(), ok: z.boolean(), motivo: z.string().nullable(), origen: z.enum(['simulado', 'testnet']), bloque: z.number().optional() });
export const chainStoreSchema = z.object({ version: z.literal(1), identity: z.object({ chainId: z.number(), address: z.string(), agent: z.string(), user: z.string(), deployBlock: z.number() }),
  controls: z.object({ caido: z.boolean(), caidaDesde: z.number().nullable(), agenteActivo: z.boolean() }),
  monitor: z.object({ observadoDesde: z.number().nullable(), inicioCaida: z.number().nullable(), muestras: z.number(), ultimaRevision: z.number().nullable(), error: z.string().nullable() }),
  scanned: z.number(), eventos: z.array(event), operations: z.record(z.string(), operation),
});
export type ChainStore = z.infer<typeof chainStoreSchema>;
export type ChainOperation = z.infer<typeof operation>;

export function chainIdentity(env: BackendEnvironment) {
  return { chainId: env.MONAD_CHAIN_ID, address: getAddress(env.CONTRACT_ADDRESS!),
    agent: new Wallet(env.AGENT_PRIVATE_KEY!).address, user: new Wallet(env.DEMO_USER_PRIVATE_KEY!).address,
    deployBlock: env.CONTRACT_DEPLOY_BLOCK! };
}
export function withChainStore<T>(env: BackendEnvironment, work: (state: ChainStore, save: () => Promise<void>) => Promise<T>) {
  const identity = chainIdentity(env);
  return withStateStore(env, 'chain', env.STATE_FILE + '.chain.json', () => ({ version: 1 as const, identity,
    controls: { caido: false, caidaDesde: null, agenteActivo: true },
    monitor: { observadoDesde: null, inicioCaida: null, muestras: 0, ultimaRevision: null, error: null },
    scanned: identity.deployBlock - 1, eventos: [], operations: {} }), (data) => chainStoreSchema.parse(data), async (state, save) => {
    if (JSON.stringify(state.identity) !== JSON.stringify(identity)) throw new ApiError('DEPLOYMENT_CHANGED',
      `El estado pertenece a otro contrato o wallets. Configura ${env.STORAGE_BACKEND === 'supabase' ? 'un nuevo STATE_NAMESPACE' : 'una nueva STATE_FILE'} sin borrar el historial.`, 409);
    return work(state, save);
  });
}
