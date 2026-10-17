import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { publicSimulationState, readSimulationSnapshot, StateError } from "./state.ts";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "downtime-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, file: join(directory, "state.json") };
}

test("peticiones concurrentes inicializan una única instantánea completa", async (t) => {
  const { directory, file } = await fixture(t);
  const snapshots = await Promise.all(Array.from({ length: 12 }, () => readSimulationSnapshot(file)));
  for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0]);
  assert.equal(snapshots[0].fondo, "1.000");
  assert.equal(snapshots[0].polizas.length, 0);
  assert.deepEqual(await readdir(directory), ["state.json"]);
});

test("cada lectura observa el estado persistido y no una copia en memoria", async (t) => {
  const { file } = await fixture(t);
  const snapshot = await readSimulationSnapshot(file);
  await writeFile(file, JSON.stringify({ ...snapshot, agenteActivo: false, exchangeCaido: true, fondo: "0.990" }));
  const reloaded = await readSimulationSnapshot(file);
  assert.equal(reloaded.agenteActivo, false);
  assert.equal(reloaded.exchangeCaido, true);
  assert.equal(reloaded.fondo, "0.990");
});

test("un JSON corrupto falla sin borrar ni reiniciar el estado", async (t) => {
  const { file } = await fixture(t);
  const corrupted = "{polizas: datos-incompletos";
  await writeFile(file, corrupted);
  await assert.rejects(readSimulationSnapshot(file), (error: unknown) => error instanceof StateError && error.codigo === "STATE_INVALID");
  assert.equal(await readFile(file, "utf8"), corrupted);
});

test('el estado anterior se conserva y se interpreta como Binance sin cambiar el archivo', async (t) => {
  const { file } = await fixture(t);
  const snapshot = await readSimulationSnapshot(file);
  const { servicios: _services, ...legacy } = snapshot;
  const saved = JSON.stringify({ ...legacy, exchangeCaido: true, caidaIniciadaEn: 123 });
  await writeFile(file, saved);
  const reloaded = await readSimulationSnapshot(file);
  assert.deepEqual(reloaded.servicios[1], { caido: true, caidaIniciadaEn: 123 });
  assert.deepEqual(reloaded.servicios[2], { caido: false, caidaIniciadaEn: null });
  assert.equal(await readFile(file, 'utf8'), saved);
});

test("rechaza montos inválidos, IDs duplicados y hashes que aparenten transacciones reales", async (t) => {
  const { file } = await fixture(t);
  const snapshot = await readSimulationSnapshot(file);
  const policy = { id: "1", dueno: "0x0000000000000000000000000000000000000001", servicioId: 1, inicio: 100, fin: 200, estado: "Activa" };
  for (const invalid of [
    { ...snapshot, fondo: -1 },
    { ...snapshot, bono: "-1.00" },
    { ...snapshot, polizas: [policy, policy] },
    { ...snapshot, eventos: [{ id: "evt-1", tipo: "Pagado", polizaId: "1", txHash: `0x${"a".repeat(64)}`, timestamp: 150, ok: true, motivo: null, origen: "simulado" }] },
  ]) {
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(readSimulationSnapshot(file), StateError);
  }
});

test("la respuesta pública elimina campos internos y calcula expiración sin modificar el archivo", async (t) => {
  const { file } = await fixture(t);
  const snapshot = await readSimulationSnapshot(file);
  const policy = { id: "1", dueno: "0x0000000000000000000000000000000000000001", servicioId: 1, inicio: 100, fin: 200, estado: "Activa" };
  await writeFile(file, JSON.stringify({ ...snapshot, campoPrivado: "no-publicar", polizas: [{ ...policy, datoPrivado: "no-publicar" }, { ...policy, id: "2", estado: "Pagada" }] }));
  const reloaded = await readSimulationSnapshot(file);
  const before = await readFile(file, "utf8");
  assert.equal(publicSimulationState(reloaded, 199).polizas[0].estado, "Activa");
  const result = publicSimulationState(reloaded, 200);
  assert.equal(result.polizas[0].estado, "Expirada");
  assert.equal(result.polizas[1].estado, "Pagada");
  assert.equal(result.contrato, null);
  assert.ok(!JSON.stringify(result).includes("no-publicar"));
  assert.ok(!("schemaVersion" in result));
  assert.equal(await readFile(file, "utf8"), before);
});

test("errores de almacenamiento no exponen rutas internas", async (t) => {
  const { directory } = await fixture(t);
  const parent = join(directory, "archivo-no-directorio");
  await writeFile(parent, "contenido");
  await assert.rejects(readSimulationSnapshot(join(parent, "state.json")), (error: unknown) => {
    assert.ok(error instanceof StateError);
    assert.equal(error.codigo, "STATE_UNAVAILABLE");
    assert.ok(!error.message.includes(directory));
    return true;
  });
});
