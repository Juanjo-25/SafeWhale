import 'server-only';
import { readFile } from 'node:fs/promises';
import type { BackendEnvironment } from './env-schema';
import { snapshotSchema } from './state';
import { chainIdentity, chainStoreSchema } from './chain-store';
import { monitorSchema } from './monitor-engine';
import { databaseClient, databaseQuery, type StoreKind } from './postgres-store';
import { StateError } from './state-error';

export async function importLocalState(env: BackendEnvironment, file: string, apply = false) {
  const documents: { kind: StoreKind; payload: unknown }[] = [];
  for (const [kind, suffix, schema] of [
    ['simulation', '', snapshotSchema], ['chain', '.chain.json', chainStoreSchema],
    ['monitor', '.monitor.json', monitorSchema],
  ] as const) {
    let content: string;
    try { content = await readFile(file + suffix, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new StateError('STATE_UNAVAILABLE', 'No se pudo leer el estado local para importar.'); }
    let payload: unknown;
    try { payload = schema.parse(JSON.parse(content)); }
    catch { throw new StateError('STATE_INVALID', 'Hay un archivo de estado inválido. No se importó ningún dato.'); }
    if (kind === 'chain' && env.BACKEND_MODE === 'testnet') {
      const state = chainStoreSchema.parse(payload);
      if (JSON.stringify(state.identity) !== JSON.stringify(chainIdentity(env)))
        throw new StateError('DEPLOYMENT_CHANGED', 'El estado local pertenece a otro contrato o wallets. Conserva sus archivos.');
    }
    documents.push({ kind, payload });
  }
  if (!documents.length) throw new StateError('STATE_UNAVAILABLE', 'No hay archivos de estado para importar.');
  if (!apply) return { ok: true, aplicado: false, documentos: documents.map((doc) => doc.kind) };
  const client = await databaseClient(env);
  let committed = false;
  try {
    await databaseQuery(client, 'begin');
    for (const document of documents) {
      // Sin ON CONFLICT: todos los documentos se importan o ninguno. No sustituir
      // un journal remoto que pueda tener transacciones nuevas o pendientes.
      await databaseQuery(client, 'insert into safewhale.state_documents (namespace, kind, payload) values ($1, $2, $3::jsonb)',
        [env.STATE_NAMESPACE, document.kind, JSON.stringify(document.payload)]);
    }
    await databaseQuery(client, 'commit'); committed = true;
    return { ok: true, aplicado: true, documentos: documents.map((doc) => doc.kind) };
  } finally {
    if (!committed) await client.query('rollback').catch(() => {});
    client.release();
  }
}
