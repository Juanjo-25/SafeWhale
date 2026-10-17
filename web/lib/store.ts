import type { BackendEnvironment } from './env-schema';
import { withFileStore } from './file-store';
import { withPostgresStore, type StoreKind } from './postgres-store';

export function withStateStore<T, R>(env: BackendEnvironment, kind: StoreKind, file: string, initial: () => T,
  parse: (input: unknown) => T, work: (state: T, save: () => Promise<void>) => Promise<R>) {
  return env.STORAGE_BACKEND === 'supabase'
    ? withPostgresStore(env, kind, initial, parse, work)
    : withFileStore(file, initial, parse, work);
}
