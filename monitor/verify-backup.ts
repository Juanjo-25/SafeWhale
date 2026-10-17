import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { loadBackendEnvironment } from './load-env.ts';
import { administrativeEnvironment } from './db-admin.ts';
import { parseDatabaseBackup, exportDatabaseBackup, restoreDatabaseBackup } from '../web/lib/database-backup.ts';
import { databaseClient, databaseQuery, databaseError, closeDatabases } from '../web/lib/postgres-store.ts';
import { StateError } from '../web/lib/state-error.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';

try {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new StateError('BACKUP_USAGE', 'Uso: pnpm db:verify-backup archivo.json');
  const backup = parseDatabaseBackup(JSON.parse(await readFile(path, 'utf8')));
  const { env } = loadBackendEnvironment();
  const admin = await databaseClient(await administrativeEnvironment());
  // Solo este namespace aleatorio se crea y elimina; nunca se activa en la app.
  const target = 'recovery_test_' + randomUUID().replaceAll('-', '');
  try {
    const canClean = await databaseQuery(admin, "select has_table_privilege(current_user, 'safewhale.state_documents', 'DELETE') as allowed");
    if (!canClean.rows[0].allowed) throw new StateError('DATABASE_PERMISSION_DENIED', 'La verificación necesita la conexión administrativa para limpiar su espacio temporal.');
    await restoreDatabaseBackup(env, backup, target, true);
    try {
      const restored = await exportDatabaseBackup({ ...env, STATE_NAMESPACE: target });
      if (!isDeepStrictEqual(restored.content.documents, backup.content.documents) ||
          !isDeepStrictEqual(restored.content.events.map((event) => ({ ...event, namespace: backup.content.namespace })), backup.content.events))
        throw new StateError('BACKUP_VERIFY_FAILED', 'El respaldo restaurado no coincide con el original.');
    } finally {
      await databaseQuery(admin, 'delete from safewhale.state_documents where namespace = $1', [target]);
    }
    console.log(JSON.stringify({ ok: true, integridadVerificada: true, restauracionVerificada: true,
      documentos: backup.content.documents.length, eventos: backup.content.events.length, espacioTemporalEliminado: true }, null, 2));
  } finally { admin.release(); }
} catch (error) {
  console.error(error instanceof EnvironmentError ? error.message : databaseError(error).message); process.exitCode = 1;
} finally { await closeDatabases(); }
