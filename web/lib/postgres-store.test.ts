import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test, type TestContext } from 'node:test';
import { parseEnvironment } from './env-schema';
import { checkDatabase, closeDatabases, databasePool, databaseConnectionOptions, withPostgresStore } from './postgres-store';
import { readSimulationSnapshot, updateSimulationSnapshot, StateError } from './state';
import { buySimulationCover, dropSimulationExchange } from './contract';
import { runMonitorOnce } from './monitor-engine';
import { withChainStore } from './chain-store';
import { importLocalState } from './database-import';
import { exportDatabaseBackup, restoreDatabaseBackup, parseDatabaseBackup } from './database-backup';
import { GET as health } from '../../api/app/api/health/route';

const url = process.env.SAFEWHALE_TEST_DATABASE_URL;
const options = { skip: !url && 'Requiere SAFEWHALE_TEST_DATABASE_URL de una base de pruebas.' };
after(closeDatabases);

// Las pruebas pueden operar con el usuario restringido y limpiar sus namespaces
// con una conexión administrativa separada, sin conceder DELETE al runtime.
const cleanupPool = (env: ReturnType<typeof parseEnvironment>) => databasePool({ ...env,
  DATABASE_URL: process.env.SAFEWHALE_TEST_ADMIN_DATABASE_URL ?? env.DATABASE_URL });

test('Supabase empaqueta su CA con TLS estricto y conserva conexiones y certificados explícitos', () => {
  const options = databaseConnectionOptions('postgresql://test:synthetic@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=verify-full');
  assert.equal(new URL(options.connectionString!).searchParams.has('sslmode'), false);
  assert.equal(typeof options.ssl, 'object');
  assert.equal((options.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.match((options.ssl as { ca: string }).ca, /BEGIN CERTIFICATE/);
  for (const url of ['postgresql://localhost/test', 'postgresql://db.example/test?sslmode=verify-full',
    'postgresql://test.supabase.co/test?sslmode=verify-full&sslrootcert=/custom/root.crt']) {
    assert.deepEqual(databaseConnectionOptions(url), { connectionString: url });
  }
});

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'safewhale-database-'));
  const env = parseEnvironment({ STORAGE_BACKEND: 'supabase', DATABASE_URL: url,
    STATE_NAMESPACE: 'test_' + randomUUID().replaceAll('-', ''), STATE_FILE: join(directory, 'state.json') });
  t.after(async () => {
    await cleanupPool(env).query('delete from safewhale.state_documents where namespace = $1', [env.STATE_NAMESPACE]);
    await rm(directory, { recursive: true, force: true });
  });
  return env;
}

test('compras concurrentes conservan una sola póliza y sobreviven a una reconexión', options, async (t) => {
  const env = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    buySimulationCover(env, 'same-purchase-0001', { servicioId: 1, horas: 4 })));
  assert.equal(results.filter((r) => !r.replayed).length, 1);
  for (const result of results) assert.deepEqual(result.resultado, results[0].resultado);
  await closeDatabases();
  const state = await readSimulationSnapshot('ruta-ignorada-en-supabase', env);
  assert.equal(state.polizas.length, 1); assert.equal(state.fondo, '1.004');
  await assert.rejects(readFile(env.STATE_FILE), { code: 'ENOENT' });
  await assert.rejects(buySimulationCover(env, 'same-purchase-0001', { servicioId: 1, horas: 2 }),
    (error: unknown) => (error as { codigo: string }).codigo === 'IDEMPOTENCY_CONFLICT');
});

test('el journal guarda antes del RPC y conserva el envío cuando falla la operación', options, async (t) => {
  const base = await fixture(t);
  const env = parseEnvironment({ ...base, BACKEND_MODE: 'testnet',
    CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001', CONTRACT_DEPLOY_BLOCK: 0,
    AGENT_PRIVATE_KEY: '0x' + '1'.padStart(64, '0'), DEMO_USER_PRIVATE_KEY: '0x' + '2'.padStart(64, '0'),
    DEMO_API_TOKEN: 'token-sintetico-para-pruebas-000000000' });
  await assert.rejects(withChainStore(env, async (state, save) => {
    state.operations['pending-test'] = { fingerprint: 'synthetic', action: 'buy', input: {}, actor: 'user',
      status: 'prepared', raw: '0x1234', hash: '0x' + 'a'.repeat(64), started: 1 };
    await save();
    state.controls.caido = true;
    throw new Error('RPC timeout sintético');
  }), /RPC timeout/);
  await closeDatabases();
  await withChainStore(env, async (state) => {
    assert.equal(state.operations['pending-test'].raw, '0x1234');
    assert.equal(state.controls.caido, false);
  });
});

test('namespace aísla demos y un estado inválido nunca vuelve a archivos locales', options, async (t) => {
  const one = await fixture(t); const two = await fixture(t);
  await buySimulationCover(one, 'purchase-namespace-0001', { servicioId: 1, horas: 1 });
  assert.equal((await readSimulationSnapshot(two.STATE_FILE, two)).polizas.length, 0);
  await databasePool(one).query('update safewhale.state_documents set payload = $1 where namespace = $2 and kind = $3',
    [{ corrupto: true }, one.STATE_NAMESPACE, 'simulation']);
  await assert.rejects(readSimulationSnapshot(one.STATE_FILE, one),
    (error: unknown) => error instanceof StateError && error.codigo === 'STATE_INVALID');
  const saved = await databasePool(one).query('select payload from safewhale.state_documents where namespace = $1', [one.STATE_NAMESPACE]);
  assert.deepEqual(saved.rows[0].payload, { corrupto: true });
  await assert.rejects(readFile(one.STATE_FILE), { code: 'ENOENT' });
});

test('monitor PostgreSQL conserva observaciones y paga una vez tras reiniciar', options, async (t) => {
  const env = await fixture(t);
  await buySimulationCover(env, 'purchase-monitor-0001', { servicioId: 1, horas: 1 });
  await dropSimulationExchange(env, 'drop-monitor-0001', { servicioId: 1 });
  const start = (await readSimulationSnapshot(env.STATE_FILE, env)).servicios[1].caidaIniciadaEn!;
  const fetcher = (async (input: RequestInfo | URL) => {
    const id = Number(new URL(String(input)).searchParams.get('servicioId')) as 1 | 2;
    const state = (await readSimulationSnapshot(env.STATE_FILE, env)).servicios[id];
    return Response.json({ modo: 'simulado', servicioId: id, disponible: !state.caido, caidaDesde: state.caidaIniciadaEn },
      { status: state.caido ? 503 : 200 });
  }) as typeof fetch;
  assert.equal((await runMonitorOnce(env, fetcher, start)).reported, 0);
  await closeDatabases();
  assert.equal((await runMonitorOnce(env, fetcher, start + 10)).reported, 1);
  assert.equal((await runMonitorOnce(env, fetcher, start + 12)).paid, 1);
  await closeDatabases();
  assert.equal((await runMonitorOnce(env, fetcher, start + 14)).paid, 0);
  assert.equal((await readSimulationSnapshot(env.STATE_FILE, env)).polizas[0].estado, 'Pagada');
});

test('importación tiene vista previa y revierte todo si hay un documento existente', options, async (t) => {
  const env = await fixture(t);
  const local = { ...env, STORAGE_BACKEND: 'file' as const };
  const original = await readSimulationSnapshot(env.STATE_FILE, local);
  await writeFile(env.STATE_FILE + '.monitor.json', JSON.stringify({ identity: 'simulado', observations: [] }));
  assert.equal((await importLocalState(env, env.STATE_FILE)).aplicado, false);
  assert.equal((await databasePool(env).query('select * from safewhale.state_documents where namespace = $1', [env.STATE_NAMESPACE])).rowCount, 0);
  await withPostgresStore(env, 'monitor', () => ({ preserved: true }), (input) => input, async () => {});
  await assert.rejects(importLocalState(env, env.STATE_FILE, true),
    (error: unknown) => error instanceof StateError && error.codigo === 'DATABASE_IMPORT_CONFLICT');
  assert.equal((await databasePool(env).query('select * from safewhale.state_documents where namespace = $1', [env.STATE_NAMESPACE])).rowCount, 1);
  await cleanupPool(env).query('delete from safewhale.state_documents where namespace = $1', [env.STATE_NAMESPACE]);
  assert.equal((await importLocalState(env, env.STATE_FILE, true)).aplicado, true);
  assert.deepEqual(await readSimulationSnapshot(env.STATE_FILE, env), original);
  assert.deepEqual(JSON.parse(await readFile(env.STATE_FILE, 'utf8')), original);
});

test('health verifica la conexión y el esquema sin exponer DATABASE_URL', options, async (t) => {
  const env = await fixture(t);
  assert.equal((await checkDatabase(env)).conectado, true);
  const previous = process.env;
  process.env = { NODE_ENV: 'test', STORAGE_BACKEND: 'supabase', DATABASE_URL: env.DATABASE_URL, STATE_NAMESPACE: env.STATE_NAMESPACE };
  try {
    const response = await health(); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.baseDatos.conectado, true);
    assert.ok(!JSON.stringify(body).includes(env.DATABASE_URL!));
  } finally { process.env = previous; }
  const secured = await databasePool(env).query("select relrowsecurity from pg_class where oid = 'safewhale.state_documents'::regclass");
  assert.equal(secured.rows[0].relrowsecurity, true);
});

test('el historial conserva eventos fuera del estado y el respaldo recupera ambos sin sobrescribir', options, async (t) => {
  const env = await fixture(t);
  await buySimulationCover(env, 'backup-purchase-0001', { servicioId: 1, horas: 1 });
  await updateSimulationSnapshot(env.STATE_FILE, (state) => { state.eventos = []; }, env);
  const backup = await exportDatabaseBackup(env);
  assert.equal(backup.content.events.length, 1);
  assert.equal((await readSimulationSnapshot(env.STATE_FILE, env)).eventos.length, 0);
  const target = 'restored_' + randomUUID().replaceAll('-', '');
  t.after(async () => { await cleanupPool(env).query('delete from safewhale.state_documents where namespace = $1', [target]); });
  assert.equal((await restoreDatabaseBackup(env, backup, target)).aplicado, false);
  assert.equal((await databasePool(env).query('select 1 from safewhale.state_documents where namespace = $1', [target])).rowCount, 0);
  await restoreDatabaseBackup(env, backup, target, true);
  const restored = await exportDatabaseBackup({ ...env, STATE_NAMESPACE: target });
  assert.deepEqual(restored.content.documents, backup.content.documents);
  assert.deepEqual(restored.content.events.map((e) => ({ ...e, namespace: env.STATE_NAMESPACE })), backup.content.events);
  await assert.rejects(restoreDatabaseBackup(env, backup, target, true), (error: unknown) =>
    error instanceof StateError && error.codigo === 'DATABASE_IMPORT_CONFLICT');
  await assert.rejects(restoreDatabaseBackup(env, backup, env.STATE_NAMESPACE, true), (error: unknown) =>
    error instanceof StateError && error.codigo === 'BACKUP_TARGET_INVALID');
  const changed = structuredClone(backup); changed.content.documents[0].payload = { corrupto: true };
  assert.throws(() => parseDatabaseBackup(changed), (error: unknown) => error instanceof StateError && error.codigo === 'BACKUP_INVALID');
});

test('el usuario runtime opera con RLS y no puede borrar datos ni crear tablas', options, async (t) => {
  const env = await fixture(t);
  const client = await databasePool(env).connect();
  try {
    await client.query('begin');
    await client.query('set local role safewhale_runtime');
    const role = await client.query('select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname=current_user');
    assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
    await client.query('insert into safewhale.state_documents(namespace,kind,payload) values($1,$2,$3)',
      [env.STATE_NAMESPACE, 'monitor', JSON.stringify({ identity: 'simulado', observations: [] })]);
    assert.equal((await client.query('select kind from safewhale.state_documents where namespace=$1', [env.STATE_NAMESPACE])).rowCount, 1);
    for (const sql of ["delete from safewhale.state_documents where false", 'create table safewhale.forbidden_test(id int)']) {
      await client.query('savepoint denied');
      await assert.rejects(client.query(sql), (error: unknown) => (error as { code: string }).code === '42501');
      await client.query('rollback to savepoint denied');
    }
  } finally { await client.query('rollback').catch(() => {}); client.release(); }
});
