import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadBackendEnvironment } from './load-env.ts';
import { exportDatabaseBackup } from '../web/lib/database-backup.ts';
import { closeDatabases, databaseError } from '../web/lib/postgres-store.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';

try {
  const { env } = loadBackendEnvironment();
  const backup = await exportDatabaseBackup(env);
  const directory = new URL('../supabase/backups/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = fileURLToPath(new URL(backup.content.createdAt.replace(/[:.]/g, '-') + '.json', directory));
  await writeFile(path, JSON.stringify(backup, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ok: true, archivo: path, documentos: backup.content.documents.length,
    eventos: backup.content.events.length, integridad: 'sha256' }, null, 2));
} catch (error) {
  console.error(error instanceof EnvironmentError ? error.message : databaseError(error).message); process.exitCode = 1;
} finally { await closeDatabases(); }
