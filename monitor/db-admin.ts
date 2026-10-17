import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadBackendEnvironment } from './load-env.ts';
import { parseEnvironment } from '../web/lib/env-schema.ts';
import { StateError } from '../web/lib/state-error.ts';

export const adminConnectionPath = fileURLToPath(new URL('../supabase/.admin-connection.json', import.meta.url));
export async function administrativeEnvironment() {
  const { env } = loadBackendEnvironment();
  try {
    const stored = JSON.parse(await readFile(adminConnectionPath, 'utf8'));
    const saved = new URL(stored.databaseUrl);
    const active = new URL(env.DATABASE_URL!);
    const project = (url: URL) => decodeURIComponent(url.username).split('.').slice(1).join('.');
    if (saved.host !== active.host || saved.pathname !== active.pathname ||
        (active.hostname.endsWith('.pooler.supabase.com') && project(saved) !== project(active)))
      throw new StateError('DATABASE_CONFIG_MISSING', 'La conexión administrativa guardada pertenece a otro proyecto. No se ejecutó ninguna migración.');
    return parseEnvironment({ ...env, DATABASE_URL: stored.databaseUrl });
  } catch (error) {
    if (error instanceof StateError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return env;
    throw new StateError('DATABASE_CONFIG_MISSING', 'No se pudo leer la conexión administrativa privada.');
  }
}

export async function applyDatabaseMigrations(client: import('pg').PoolClient) {
  // Archivos explícitos y ordenados. Las migraciones son repetibles y conservan datos.
  for (const name of ['202610170001_state_documents.sql', '202610170002_audit_runtime.sql']) {
    const sql = await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
    await client.query(sql);
  }
}
