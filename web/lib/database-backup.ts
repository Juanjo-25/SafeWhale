import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BackendEnvironment } from './env-schema';
import { snapshotSchema } from './state';
import { chainStoreSchema } from './chain-store';
import { monitorSchema } from './monitor-engine';
import { databaseClient, databaseQuery } from './postgres-store';
import { StateError } from './state-error';

const namespace = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const document = z.object({ kind: z.enum(['simulation', 'chain', 'monitor']), payload: z.unknown() }).strict();
const history = z.object({ namespace, source_kind: z.enum(['simulation', 'chain']), id: z.string(), tipo: z.string(),
  poliza_id: z.string().nullable(), servicio_id: z.number().int().nullable(), tx_hash: z.string().nullable(),
  occurred_at: z.number().int().nonnegative().safe(), ok: z.boolean(), motivo: z.string().nullable(),
  origen: z.enum(['simulado', 'testnet']), bloque: z.number().int().nonnegative().safe().nullable() }).strict();
const contentSchema = z.object({ version: z.literal(1), namespace, createdAt: z.string().datetime(),
  documents: z.array(document).min(1).max(3), events: z.array(history) }).strict();
export type DatabaseBackupContent = z.infer<typeof contentSchema>;
export type DatabaseBackup = { content: DatabaseBackupContent; sha256: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
const digest = (content: DatabaseBackupContent) => createHash('sha256').update(canonical(content)).digest('hex');

export function parseDatabaseBackup(input: unknown): DatabaseBackup {
  try {
    const parsed = z.object({ content: contentSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
    if (digest(parsed.content) !== parsed.sha256) throw new Error('checksum');
    const kinds = parsed.content.documents.map((doc) => doc.kind);
    if (new Set(kinds).size !== kinds.length) throw new Error('duplicates');
    if (new Set(parsed.content.events.map((event) => JSON.stringify([event.source_kind, event.id]))).size !== parsed.content.events.length)
      throw new Error('duplicate events');
    for (const doc of parsed.content.documents) {
      const schema = doc.kind === 'simulation' ? snapshotSchema : doc.kind === 'chain' ? chainStoreSchema : monitorSchema;
      schema.parse(doc.payload);
    }
    if (parsed.content.events.some((event) => event.namespace !== parsed.content.namespace || !kinds.includes(event.source_kind))) throw new Error('history');
    return parsed;
  } catch { throw new StateError('BACKUP_INVALID', 'El respaldo está incompleto, fue modificado o no tiene un formato válido.'); }
}

export async function exportDatabaseBackup(env: BackendEnvironment): Promise<DatabaseBackup> {
  const client = await databaseClient(env);
  let completed = false;
  try {
    await databaseQuery(client, 'begin isolation level repeatable read read only');
    const documents = await databaseQuery<{ kind: 'simulation' | 'chain' | 'monitor'; payload: unknown }>(client,
      'select kind, payload from safewhale.state_documents where namespace = $1 order by kind', [env.STATE_NAMESPACE]);
    const events = await databaseQuery<{ event: z.infer<typeof history> }>(client,
      'select to_jsonb(e) as event from safewhale.event_history e where namespace = $1 order by source_kind, id', [env.STATE_NAMESPACE]);
    const content = contentSchema.parse({ version: 1, namespace: env.STATE_NAMESPACE, createdAt: new Date().toISOString(),
      documents: documents.rows, events: events.rows.map((row) => row.event) });
    const backup = parseDatabaseBackup({ content, sha256: digest(content) });
    await databaseQuery(client, 'commit'); completed = true;
    return backup;
  } finally {
    if (!completed) await client.query('rollback').catch(() => {});
    client.release();
  }
}

export async function restoreDatabaseBackup(env: BackendEnvironment, input: unknown, target: string, apply = false) {
  const backup = parseDatabaseBackup(input);
  if (!namespace.safeParse(target).success || target === env.STATE_NAMESPACE)
    throw new StateError('BACKUP_TARGET_INVALID', 'Elige un namespace nuevo, distinto al activo. La restauración no reemplaza el estado actual.');
  const summary = { ok: true, aplicado: apply, documentos: backup.content.documents.length, eventos: backup.content.events.length };
  if (!apply) return summary;
  const client = await databaseClient(env);
  let completed = false;
  try {
    await databaseQuery(client, 'begin');
    const existing = await databaseQuery(client, 'select 1 from safewhale.state_documents where namespace = $1 limit 1', [target]);
    if (existing.rowCount) throw new StateError('DATABASE_IMPORT_CONFLICT', 'El destino ya tiene datos. No se reemplazó ningún registro.');
    for (const doc of backup.content.documents) await databaseQuery(client,
      'insert into safewhale.state_documents (namespace, kind, payload) values ($1, $2, $3::jsonb)', [target, doc.kind, JSON.stringify(doc.payload)]);
    await databaseQuery(client, `insert into safewhale.event_history
      (namespace, source_kind, id, tipo, poliza_id, servicio_id, tx_hash, occurred_at, ok, motivo, origen, bloque)
      select $1, e.source_kind, e.id, e.tipo, e.poliza_id, e.servicio_id, e.tx_hash, e.occurred_at, e.ok, e.motivo, e.origen, e.bloque
      from jsonb_to_recordset($2::jsonb) as e(source_kind text, id text, tipo text, poliza_id text, servicio_id integer,
        tx_hash text, occurred_at bigint, ok boolean, motivo text, origen text, bloque bigint)
      on conflict (namespace, source_kind, id) do nothing`, [target, JSON.stringify(backup.content.events)]);
    await databaseQuery(client, 'commit'); completed = true;
    return summary;
  } finally {
    if (!completed) await client.query('rollback').catch(() => {});
    client.release();
  }
}
