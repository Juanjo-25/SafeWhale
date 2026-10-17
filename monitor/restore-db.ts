import { readFile } from 'node:fs/promises';
import { loadBackendEnvironment } from './load-env.ts';
import { restoreDatabaseBackup } from '../web/lib/database-backup.ts';
import { closeDatabases, databaseError } from '../web/lib/postgres-store.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';
import { StateError } from '../web/lib/state-error.ts';

try {
  const args = process.argv.slice(2);
  const path = args.find((arg) => !arg.startsWith('--'));
  const namespace = args.find((arg) => arg.startsWith('--namespace='))?.slice('--namespace='.length);
  if (!path || !namespace || args.some((arg) => arg.startsWith('--') && arg !== '--apply' && !arg.startsWith('--namespace=')))
    throw new StateError('BACKUP_USAGE', 'Uso: pnpm db:restore archivo.json --namespace=nuevo_espacio [--apply]');
  const { env } = loadBackendEnvironment();
  const input = JSON.parse(await readFile(path, 'utf8'));
  console.log(JSON.stringify(await restoreDatabaseBackup(env, input, namespace, args.includes('--apply')), null, 2));
} catch (error) {
  console.error(error instanceof EnvironmentError ? error.message : databaseError(error).message); process.exitCode = 1;
} finally { await closeDatabases(); }
