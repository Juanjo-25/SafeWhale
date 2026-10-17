import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { adminConnectionPath, administrativeEnvironment, applyDatabaseMigrations } from './db-admin.ts';
import { loadBackendEnvironment, webDirectory } from './load-env.ts';
import { parseEnvironment, EnvironmentError } from '../web/lib/env-schema.ts';
import { databaseClient, checkDatabase, closeDatabases, databaseError } from '../web/lib/postgres-store.ts';
import { StateError } from '../web/lib/state-error.ts';

try {
  const { env: current } = loadBackendEnvironment();
  if ((await checkDatabase(current)).permisosLimitados) {
    console.log(JSON.stringify({ ok: true, permisosLimitados: true, cambio: false }));
  } else {
    const admin = await administrativeEnvironment();
    if (!admin.DATABASE_URL) throw new StateError('DATABASE_CONFIG_MISSING', 'Falta la conexión administrativa.');
    const client = await databaseClient(admin);
    let runtimeUrl: URL;
    try {
      await applyDatabaseMigrations(client);
      const existing = await client.query("select rolcanlogin from pg_roles where rolname = 'safewhale_runtime'");
      const target = new URL(admin.DATABASE_URL);
      const username = decodeURIComponent(target.username);
      const pooler = target.hostname.endsWith('.pooler.supabase.com');
      if (pooler && !username.includes('.')) throw new StateError('DATABASE_CONFIG_MISSING', 'La conexión del pooler requiere la referencia del proyecto.');
      const runtimeUsername = 'safewhale_runtime' + (pooler ? username.slice(username.indexOf('.')) : '');
      // El respaldo administrativo se escribe antes de modificar credenciales.
      await writeFile(adminConnectionPath, JSON.stringify({ databaseUrl: admin.DATABASE_URL }) + '\n', { flag: 'wx', mode: 0o600 })
        .catch(async (error) => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const saved = JSON.parse(await readFile(adminConnectionPath, 'utf8'));
          if (saved.databaseUrl !== admin.DATABASE_URL) throw new StateError('DATABASE_CONFIG_MISSING', 'La conexión administrativa guardada pertenece a otro destino.'); });
      if (existing.rows[0]?.rolcanlogin) {
        let saved: { databaseUrl: string };
        try { saved = JSON.parse(await readFile(new URL('../supabase/.runtime-connection.json', import.meta.url), 'utf8')); }
        catch { throw new StateError('DATABASE_ROLE_EXISTS', 'El usuario de runtime ya tiene credenciales. No se reemplazó su contraseña.'); }
        runtimeUrl = new URL(saved.databaseUrl);
        if (runtimeUrl.host !== target.host || runtimeUrl.pathname !== target.pathname ||
            decodeURIComponent(runtimeUrl.username) !== runtimeUsername)
          throw new StateError('DATABASE_CONFIG_MISSING', 'La conexión de runtime guardada pertenece a otro destino.');
      } else {
        const password = randomBytes(32).toString('hex');
        // Contraseña hex generada internamente: no incluye caracteres SQL especiales.
        runtimeUrl = new URL(admin.DATABASE_URL);
        runtimeUrl.username = runtimeUsername;
        runtimeUrl.password = password;
        // Guardar la nueva credencial antes de activarla permite recuperar
        // un proceso interrumpido sin rotar una contraseña ya activa.
        await writeFile(new URL('../supabase/.runtime-connection.json', import.meta.url),
          JSON.stringify({ databaseUrl: runtimeUrl.toString() }) + '\n', { mode: 0o600 });
        await client.query(`alter role safewhale_runtime login password '${password}'`);
      }
    } finally { client.release(); }
    const runtime = parseEnvironment({ ...current, DATABASE_URL: runtimeUrl.toString() });
    if (!(await checkDatabase(runtime)).permisosLimitados) throw new StateError('DATABASE_PERMISSION_DENIED', 'El usuario de runtime conserva permisos amplios.');
    const path = join(webDirectory, '.env.local');
    const content = await readFile(path, 'utf8');
    if (!/^[ \t]*DATABASE_URL[ \t]*=/m.test(content)) throw new StateError('DATABASE_CONFIG_MISSING', 'Falta DATABASE_URL en web/.env.local.');
    const temporary = path + '.database.tmp';
    await writeFile(temporary, content.replace(/^[ \t]*DATABASE_URL[ \t]*=.*$/m,
      () => 'DATABASE_URL=' + JSON.stringify(runtimeUrl.toString())), { mode: (await stat(path)).mode & 0o777 });
    await rename(temporary, path);
    console.log(JSON.stringify({ ok: true, permisosLimitados: true, cambio: true, reiniciarServidor: true }));
  }
} catch (error) {
  const safe = error instanceof EnvironmentError || error instanceof StateError ? error : databaseError(error);
  console.error(safe.message); process.exitCode = 1;
} finally { await closeDatabases(); }
