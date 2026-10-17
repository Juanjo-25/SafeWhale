import { administrativeEnvironment, applyDatabaseMigrations } from './db-admin.ts';
import { databaseClient, databaseError, closeDatabases } from '../web/lib/postgres-store.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';

try {
  const client = await databaseClient(await administrativeEnvironment());
  try { await applyDatabaseMigrations(client); }
  finally { client.release(); }
  console.log(JSON.stringify({ ok: true, migraciones: 2, datosExistentesConservados: true }));
} catch (error) {
  console.error(error instanceof EnvironmentError ? error.message : databaseError(error).message); process.exitCode = 1;
} finally { await closeDatabases(); }
