import { setTimeout } from 'node:timers/promises';
import { loadBackendEnvironment } from './load-env.ts';
import { runMonitorOnce } from '../web/lib/monitor-engine.ts';
import { ApiError } from '../web/lib/api.ts';
const { env, stateFile } = loadBackendEnvironment();
env.STATE_FILE = stateFile;
let stopped = false;
process.on('SIGINT', () => { stopped = true; }); process.on('SIGTERM', () => { stopped = true; });
console.log('Monitor iniciado (' + env.BACKEND_MODE + ').');
do {
  try {
    const result = await runMonitorOnce(env);
    if (result.reported || result.paid || result.errors.length) console.log(JSON.stringify(result));
  } catch (error) { console.error(error instanceof ApiError ? error.codigo + ': ' + error.message : 'No se pudo completar la revisión del monitor.'); }
  if (!stopped && !process.argv.includes('--once')) await setTimeout(env.MONITOR_INTERVAL_MS);
} while (!stopped && !process.argv.includes('--once'));
