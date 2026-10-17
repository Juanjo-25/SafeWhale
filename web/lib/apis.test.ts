import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { parseEther } from "ethers";
import { POST as buy } from "../app/api/comprar/route.ts";
import { POST as drop } from "../app/api/tumbar/route.ts";
import { POST as stop } from "../app/api/apagar-agente/route.ts";
import { GET as exchange } from "../app/api/exchange-mock/route.ts";
import { GET as state } from "../app/api/estado/route.ts";
import { GET as health } from "../app/api/health/route.ts";
import { readSimulationSnapshot } from "./state.ts";

const token = "token-sintetico-para-pruebas-000000000";
const input = { servicioId: 1, horas: 4 };

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "downtime-apis-"));
  const previous = process.env;
  const file = join(directory, "state.json");
  process.env = { NODE_ENV: "test", BACKEND_MODE: "simulado", STATE_FILE: file, DEMO_API_TOKEN: token };
  t.after(async () => { process.env = previous; await rm(directory, { recursive: true, force: true }); });
  return file;
}

function request(body: unknown, key: string = randomUUID(), extra: Record<string, string> = {}) {
  return new Request("http://localhost/api/demo", {
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": key, ...extra },
  });
}

test("compra crea póliza y prima exactas, sin hashes ficticios ni cambios en el bono", async (t) => {
  const file = await fixture(t);
  const response = await buy(request(input));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.modo, "simulado");
  assert.equal(result.txHash, null);
  assert.equal(result.prima, "0.004");
  assert.equal(result.pagoFijo, "0.01");
  assert.equal(result.poliza.fin - result.poliza.inicio, 4 * 3600);
  assert.equal(result.poliza.dueno, "0x0000000000000000000000000000000000000001");
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.fondo, "1.004");
  assert.equal(snapshot.bono, "0.500");
  assert.equal(snapshot.eventos[0].tipo, "CoverComprada");
  const publicBody = JSON.stringify(await (await state()).json());
  assert.ok(!publicBody.includes(token));
  assert.ok(!publicBody.includes("idempotencia"));
});

test("compras simultáneas con una misma clave cobran una sola vez", async (t) => {
  const file = await fixture(t);
  const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 12 }, () => buy(request(input, key))));
  for (const response of responses) assert.equal(response.status, 201);
  const results = await Promise.all(responses.map((response) => response.json()));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(responses.filter((response) => response.headers.get("idempotency-replayed") === "false").length, 1);
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.polizas.length, 1);
  assert.equal(snapshot.fondo, "1.004");
  assert.equal(snapshot.eventos.length, 1);
  const persisted = JSON.parse(await readFile(file, "utf8"));
  assert.equal(persisted.idempotencia.length, 1);
  assert.deepEqual(persisted.idempotencia[0].resultado, results[0]);
});

test("claves distintas conservan todas las compras simultáneas y sus IDs únicos", async (t) => {
  const file = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 10 }, () => buy(request({ servicioId: 1, horas: 1 }))));
  for (const response of responses) assert.equal(response.status, 201);
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.polizas.length, 10);
  assert.equal(new Set(snapshot.polizas.map((policy) => policy.id)).size, 10);
  assert.equal(parseEther(snapshot.fondo), parseEther("1.010"));
});

test("el bloqueo conserva compras hechas por procesos independientes", async (t) => {
  const file = await fixture(t);
  const contractUrl = new URL("./contract.ts", import.meta.url).href;
  const envUrl = new URL("./env-schema.ts", import.meta.url).href;
  const code = `import {buySimulationCover} from ${JSON.stringify(contractUrl)}; import {parseEnvironment} from ${JSON.stringify(envUrl)}; await buySimulationCover(parseEnvironment(process.env), process.argv[1], {servicioId:1,horas:1});`;
  await Promise.all(Array.from({ length: 4 }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", code, `worker-key-${index}`], { env: process.env, stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { child.kill(); reject(new Error("El proceso de compra excedió el plazo de prueba.")); }, 10000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (exit) => { clearTimeout(timer); exit === 0 ? resolve() : reject(new Error(stderr)); });
  })));
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.polizas.length, 4);
  assert.equal(new Set(snapshot.polizas.map((policy) => policy.id)).size, 4);
  assert.equal(snapshot.fondo, "1.004");
});

test("reutilizar una clave con otro body o acción devuelve conflicto", async (t) => {
  const file = await fixture(t);
  const key = randomUUID();
  assert.equal((await buy(request(input, key))).status, 201);
  for (const response of [await buy(request({ ...input, horas: 2 }, key)), await drop(request({ servicioId: 1 }, key))]) {
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.codigo, "IDEMPOTENCY_CONFLICT");
  }
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.fondo, "1.004");
  assert.equal(snapshot.exchangeCaido, false);
});

test("todas las acciones mutantes exigen autorización y una clave de idempotencia", async (t) => {
  const file = await fixture(t);
  for (const [action, body] of [[buy, input], [drop, { servicioId: 1 }], [stop, {}]] as const) {
    const unauthorized = await action(request(body, randomUUID(), { Authorization: "Bearer incorrecto" }));
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.codigo, "UNAUTHORIZED");
    const noKey = await action(request(body, ""));
    assert.equal(noKey.status, 400);
    assert.equal((await noKey.json()).error.codigo, "IDEMPOTENCY_KEY_INVALID");
  }
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.polizas.length, 0);
  assert.equal(snapshot.exchangeCaido, false);
  assert.equal(snapshot.agenteActivo, true);
});

test("rechaza servicios, horas y campos de firma elegidos por el cliente sin modificar balances", async (t) => {
  const file = await fixture(t);
  for (const body of [
    { ...input, servicioId: 2 }, { ...input, horas: 0 }, { ...input, horas: 25 },
    { ...input, horas: 1.5 }, { ...input, horas: "4" },
    { ...input, dueno: "0x0000000000000000000000000000000000000002" },
    { ...input, prima: "0.00001" },
  ]) assert.equal((await buy(request(body))).status, 400);
  assert.equal((await buy(request(input, randomUUID(), { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await buy(request({ padding: "a".repeat(5000) }))).status, 413);
  const malformed = new Request("http://localhost/api/comprar", { method: "POST", body: "{", headers: {
    "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": randomUUID(),
  } });
  assert.equal((await buy(malformed)).status, 400);
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.fondo, "1.000");
  assert.equal(snapshot.polizas.length, 0);
  assert.equal(snapshot.eventos.length, 0);
});

test("tumbar cambia el mock a 503, conserva el inicio y bloquea nuevas compras", async (t) => {
  const file = await fixture(t);
  const purchaseKey = randomUUID();
  assert.equal((await exchange()).status, 200);
  const originalPurchase = await (await buy(request(input, purchaseKey))).json();
  const key = randomUUID();
  const first = await drop(request({ servicioId: 1 }, key));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.deepEqual(await (await drop(request({ servicioId: 1 }, key))).json(), firstBody);
  const again = await (await drop(request({ servicioId: 1 }))).json();
  assert.equal(again.caidaDesde, firstBody.caidaDesde);
  const availability = await exchange();
  assert.equal(availability.status, 503);
  assert.equal((await availability.json()).disponible, false);
  const rejected = await buy(request(input));
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error.codigo, "EXCHANGE_DOWN");
  assert.deepEqual(await (await buy(request(input, purchaseKey))).json(), originalPurchase);
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.polizas.length, 1);
  assert.equal(snapshot.fondo, "1.004");
  assert.equal(snapshot.eventos.filter((entry) => entry.tipo === "ExchangeCaido").length, 1);
  assert.ok(!snapshot.eventos.some((entry) => ["Pagado", "CaidaReportada"].includes(entry.tipo)));
});

test("apagar detiene el interruptor de payouts sin deshabilitar la API ni borrar pólizas", async (t) => {
  const file = await fixture(t);
  await buy(request(input));
  const key = randomUUID();
  const first = await stop(request({}, key));
  const body = await first.json();
  assert.equal(first.status, 200);
  assert.equal(body.agenteActivo, false);
  assert.deepEqual(await (await stop(request({}, key))).json(), body);
  assert.equal((await stop(request({}))).status, 200);
  assert.equal((await state()).status, 200);
  assert.equal((await health()).status, 200);
  assert.equal((await exchange()).status, 200);
  const snapshot = await readSimulationSnapshot(file);
  assert.equal(snapshot.polizas.length, 1);
  assert.equal(snapshot.eventos.filter((entry) => entry.tipo === "AgenteApagado").length, 1);
});

test("el máximo de pólizas cuenta solo las activas y no reutiliza IDs anteriores", async (t) => {
  const file = await fixture(t);
  const snapshot = await readSimulationSnapshot(file);
  const now = Math.floor(Date.now() / 1000);
  snapshot.polizas = Array.from({ length: 50 }, (_, index) => ({
    id: String(index + 1), dueno: "0x0000000000000000000000000000000000000001", servicioId: 1,
    inicio: now - 10, fin: now + 3600, estado: "Activa",
  }));
  await writeFile(file, JSON.stringify(snapshot));
  const rejected = await buy(request(input));
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error.codigo, "POLICY_LIMIT");
  assert.equal((await readSimulationSnapshot(file)).fondo, "1.000");
  snapshot.polizas[0].fin = now - 1;
  await writeFile(file, JSON.stringify(snapshot));
  const accepted = await buy(request(input));
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).poliza.id, "51");
});
