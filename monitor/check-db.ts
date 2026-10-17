import { loadBackendEnvironment } from './load-env.ts';
import { checkDatabase, closeDatabases } from '../web/lib/postgres-store.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';
import { StateError } from '../web/lib/state-error.ts';

try {
  const { env } = loadBackendEnvironment();
  console.log(JSON.stringify(await checkDatabase(env), null, 2));
} catch (error) {
  console.error(error instanceof EnvironmentError || error instanceof StateError ? error.message : 'No se pudo verificar la base de datos.');
  process.exitCode = 1;
} finally { await closeDatabases(); }
