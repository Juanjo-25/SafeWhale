import 'server-only';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import type { BackendEnvironment } from './env-schema';
import { StateError } from './state-error';
import { SUPABASE_ROOT_CA } from '../../supabase/certs/root-ca';

export type StoreKind = 'simulation' | 'chain' | 'monitor';
const host = globalThis as typeof globalThis & { __safeWhaleDatabases?: Map<string, pg.Pool> };
const pools = host.__safeWhaleDatabases ??= new Map<string, pg.Pool>();

export function databaseConnectionOptions(connectionString: string): pg.PoolConfig {
  const url = new URL(connectionString);
  // El certificado viaja en el bundle: no depender de rutas absolutas del Mac
  // ni de archivos externos en las funciones de Vercel o el contenedor.
  if ((url.hostname.endsWith('.supabase.com') || url.hostname.endsWith('.supabase.co')) &&
      url.searchParams.get('sslmode') === 'verify-full' && !url.searchParams.has('sslrootcert') &&
      !url.searchParams.has('sslcert') && !url.searchParams.has('sslkey')) {
    // pg reemplaza config.ssl si encuentra sslmode en connectionString.
    // Se conserva TLS estricto mediante rejectUnauthorized y validación de host.
    url.searchParams.delete('sslmode');
    return { connectionString: url.href, ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true } };
  }
  return { connectionString };
}

export function databasePool(env: BackendEnvironment) {
  if (!env.DATABASE_URL) throw new StateError('DATABASE_CONFIG_MISSING', 'Configura DATABASE_URL en el servidor.');
  const key = createHash('sha256').update(env.DATABASE_URL).digest('hex');
  let pool = pools.get(key);
  if (!pool) {
    pool = new pg.Pool({ ...databaseConnectionOptions(env.DATABASE_URL), max: 6, connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000, statement_timeout: 10000, allowExitOnIdle: true });
    // Los errores del driver pueden contener datos de conexión. Nunca publicarlos.
    pool.on('error', () => {});
    pools.set(key, pool);
  }
  return pool;
}

export function databaseError(error: unknown): StateError {
  if (error instanceof StateError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (code === '42P01' || code === '3F000') return new StateError('DATABASE_SCHEMA_MISSING', 'Ejecuta la migración SQL de SafeWhale en Supabase.');
  if (code === '23505') return new StateError('DATABASE_IMPORT_CONFLICT', 'Ya existe estado en ese espacio de Supabase. La importación no reemplazó ningún dato.');
  if (code === '42501') return new StateError('DATABASE_PERMISSION_DENIED', 'La conexión no tiene los permisos necesarios de SafeWhale. Revisa las migraciones y el usuario de la aplicación.');
  if (code === '28P01') return new StateError('DATABASE_AUTH_FAILED', 'Supabase rechazó las credenciales de la conexión.');
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'].includes(code ?? ''))
    return new StateError('DATABASE_TLS_INVALID', 'No se pudo validar el certificado TLS. Revisa sslrootcert y conserva sslmode=verify-full.');
  return new StateError('DATABASE_UNAVAILABLE', 'No se pudo acceder a Supabase. Revisa la conexión y reintenta la misma operación.');
}

export async function databaseClient(env: BackendEnvironment) {
  try { return await databasePool(env).connect(); } catch (error) { throw databaseError(error); }
}

export async function databaseQuery<T extends QueryResultRow = QueryResultRow>(client: PoolClient, sql: string, values: unknown[] = []) {
  try { return await client.query<T>(sql, values); } catch (error) { throw databaseError(error); }
}

export async function withPostgresStore<T, R>(env: BackendEnvironment, kind: StoreKind, initial: () => T,
  parse: (input: unknown) => T, work: (state: T, save: () => Promise<void>) => Promise<R>): Promise<R> {
  const client = await databaseClient(env);
  // Bloqueo de sesión: DATABASE_URL debe usar conexión directa o Session pooler.
  // Cada save confirma de inmediato; no se revierte el journal si el RPC falla.
  const lockKey = JSON.stringify(['safewhale', env.STATE_NAMESPACE, kind]);
  let locked = false;
  let broken = false;
  const lost = () => { broken = true; };
  client.on('error', lost);
  try {
    const deadline = Date.now() + 60000;
    do {
      const result = await databaseQuery<{ locked: boolean }>(client,
        'select pg_try_advisory_lock(hashtextextended($1, 0)) as locked', [lockKey]);
      locked = result.rows[0].locked;
      if (!locked) {
        if (Date.now() >= deadline) throw new StateError('STATE_BUSY', 'Hay una operación en curso. Reintenta con la misma clave.');
        await delay(100);
      }
    } while (!locked);
    const found = await databaseQuery<{ payload: unknown }>(client,
      'select payload from safewhale.state_documents where namespace = $1 and kind = $2', [env.STATE_NAMESPACE, kind]);
    let state: T;
    try { state = parse(found.rows.length ? found.rows[0].payload : initial()); }
    catch { throw new StateError('STATE_INVALID', 'El estado de Supabase no es válido; se conservó sin modificar.'); }
    const save = async () => {
      if (broken) throw new StateError('DATABASE_UNAVAILABLE', 'Se perdió la conexión de Supabase. Reintenta la misma operación.');
      let payload: string;
      try { payload = JSON.stringify(parse(state)); }
      catch { throw new StateError('STATE_INVALID', 'El cambio de estado no es válido y no fue guardado.'); }
      await databaseQuery(client, `insert into safewhale.state_documents (namespace, kind, payload)
        values ($1, $2, $3::jsonb) on conflict (namespace, kind)
        do update set payload = excluded.payload, updated_at = now()`, [env.STATE_NAMESPACE, kind, payload]);
    };
    if (!found.rows.length) await save();
    return await work(state, save);
  } finally {
    if (locked && !broken) {
      try { await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]); }
      catch { broken = true; }
    }
    client.removeListener('error', lost);
    client.release(broken);
  }
}

export async function checkDatabase(env: BackendEnvironment) {
  const client = await databaseClient(env);
  try {
    await databaseQuery(client, 'select 1');
    await databaseQuery(client, 'select kind from safewhale.state_documents where namespace = $1 limit 1', [env.STATE_NAMESPACE]);
    const permissions = await databaseQuery<{ limited: boolean }>(client,
      `select not (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)
        and not has_table_privilege(current_user, 'safewhale.state_documents', 'DELETE')
        and not has_schema_privilege(current_user, 'safewhale', 'CREATE') as limited
       from pg_roles where rolname = current_user`);
    return { ok: true, almacenamiento: 'supabase', conectado: true, esquemaDisponible: true,
      permisosLimitados: permissions.rows[0]?.limited === true };
  } finally { client.release(); }
}

export async function closeDatabases() {
  const pending = [...pools.values()]; pools.clear();
  await Promise.all(pending.map((pool) => pool.end()));
}
