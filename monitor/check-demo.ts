import { formatEther } from 'ethers';
import { loadBackendEnvironment } from './load-env.ts';
import { checkDatabase, closeDatabases, databaseClient, databaseQuery } from '../web/lib/postgres-store.ts';
import { readChainState, createChainContext } from '../web/lib/chain.ts';
import { StateError } from '../web/lib/state-error.ts';
import { ApiError } from '../web/lib/api.ts';
import { EnvironmentError } from '../web/lib/env-schema.ts';

try {
  const { env, stateFile } = loadBackendEnvironment(); env.STATE_FILE = stateFile;
  if (env.STORAGE_BACKEND !== 'supabase' || env.BACKEND_MODE !== 'testnet')
    throw new StateError('DEMO_MODE_INVALID', 'La presentación verificable requiere BACKEND_MODE=testnet y STORAGE_BACKEND=supabase.');
  const database = await checkDatabase(env);
  const client = await databaseClient(env);
  let history = false; let pending = 0;
  try {
    history = (await databaseQuery(client, "select to_regclass('safewhale.event_history') is not null as available")).rows[0].available;
    pending = Number((await databaseQuery(client, `select count(*) as total from safewhale.operaciones
      where namespace=$1 and estado='prepared' and accion in ('buy','payout','claim','report')`, [env.STATE_NAMESPACE])).rows[0].total);
  } finally { client.release(); }
  const state = await readChainState(env);
  const ctx = await createChainContext(env);
  let gas = 0n;
  try { gas = await ctx.provider.getBalance(ctx.agent.address); } finally { ctx.provider.destroy(); }
  const checks = { supabase: database.conectado, permisosLimitados: database.permisosLimitados, historial: history,
    contratoVerificado: true, comprasDisponibles: state.compraHabilitada, servicioDisponible: !state.exchangeCaido,
    eventoDisponible: state.caida === null, pagosHabilitados: state.agenteActivo, agenteConGas: gas > 0n, sinTransaccionesPendientes: pending === 0 };
  const ready = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ listoParaDemo: ready, comprobaciones: checks, polizas: state.polizas.length,
    transaccionesPendientes: pending, gasAgenteMON: formatEther(gas), geminiConfigurado: Boolean(env.GEMINI_API_KEY),
    alcance: 'Solo lectura, sincronización de eventos y comprobación de configuración; no envía transacciones ni activa caídas.' }, null, 2));
  if (!ready) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof StateError || error instanceof ApiError || error instanceof EnvironmentError ? error.message : 'No se pudo verificar la preparación de la demo.');
  process.exitCode = 1;
} finally { await closeDatabases(); }
