import { loadBackendEnvironment } from './load-env.ts';
import { importLocalState } from '../web/lib/database-import.ts';
import { closeDatabases } from '../web/lib/postgres-store.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';
import { StateError } from '../web/lib/state-error.ts';

try {
  if (process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('INVALID_ARGUMENT');
  const { env, stateFile } = loadBackendEnvironment();
  console.log(JSON.stringify(await importLocalState(env, stateFile, process.argv.includes('--apply')), null, 2));
} catch (error) {
  console.error(error instanceof EnvironmentError || error instanceof StateError ? error.message : 'Uso: pnpm db:import [--apply]. Detén API y monitor antes de importar.');
  process.exitCode = 1;
} finally { await closeDatabases(); }
