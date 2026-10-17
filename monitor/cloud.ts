import { setTimeout } from 'node:timers/promises';
import { loadBackendEnvironment } from './load-env.ts';
import { runMonitorOnce } from '../web/lib/monitor-engine.ts';
import { closeDatabases, checkDatabase } from '../web/lib/postgres-store.ts';
import { ApiError } from '../web/lib/api.ts';
import { StateError } from '../web/lib/state-error.ts';

const shutdown = new AbortController();
process.on('SIGTERM', () => shutdown.abort());
process.on('SIGINT', () => shutdown.abort());

try {
  const { env, stateFile } = loadBackendEnvironment();
  if (env.STORAGE_BACKEND !== 'supabase') throw new Error('STORAGE_BACKEND');
  env.STATE_FILE = stateFile;
  env.MONITOR_SOURCE = 'store';
  await checkDatabase(env);
  console.log('Monitor cloud iniciado; fuente de demo: Supabase (' + env.BACKEND_MODE + ').');
  while (!shutdown.signal.aborted) {
    try {
      const result = await runMonitorOnce(env);
      if (result.reported || result.paid || result.errors.length) console.log(JSON.stringify(result));
    } catch (error) {
      console.error(error instanceof ApiError || error instanceof StateError ? error.codigo : 'MONITOR_UNAVAILABLE');
    }
    try { await setTimeout(env.MONITOR_INTERVAL_MS, undefined, { signal: shutdown.signal }); }
    catch { /* SIGTERM interrumpe la espera; la operación en curso ya terminó. */ }
  }
} catch (error) {
  console.error(error instanceof ApiError || error instanceof StateError ? error.codigo
    : 'Configura STORAGE_BACKEND=supabase y las variables del backend antes de iniciar el daemon.');
  process.exitCode = 1;
} finally { await closeDatabases(); }
