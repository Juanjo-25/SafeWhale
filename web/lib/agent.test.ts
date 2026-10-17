import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { askAgent, type ToolCaller } from "./agent.ts";
import { ApiError } from "./api.ts";
import { parseEnvironment } from "./env-schema.ts";
import { quoteSimulationCover } from "./contract.ts";
import { readSimulationSnapshot, updateSimulationSnapshot } from "./state.ts";
import { POST } from "../app/api/chat/route.ts";

const token = "token-sintetico-para-pruebas-000000000";
const quoteCaller: ToolCaller = async () => ({ functionCalls: [{ name: "cotizarCobertura", args: { servicioId: 1, horas: 4 } }] });

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "downtime-agent-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return parseEnvironment({ STATE_FILE: join(directory, "state.json"), GEMINI_API_KEY: "clave-sintetica", DEMO_API_TOKEN: token });
}

test("una herramienta de cotización usa los mismos precios de compra y no crea pólizas", async (t) => {
  const env = await fixture(t);
  const snapshot = await readSimulationSnapshot(env.STATE_FILE);
  const before = await readFile(env.STATE_FILE, "utf8");
  const result = await askAgent(env, "Cubre el exchange por cuatro horas", quoteCaller);
  assert.equal(result.iaDisponible, true);
  assert.equal(result.txHash, null);
  assert.deepEqual(result.herramientasUtilizadas, ["cotizarCobertura"]);
  assert.deepEqual(result.compraPropuesta, quoteSimulationCover({ servicioId: 1, horas: 4 }));
  assert.equal(result.compraPropuesta!.requiereConfirmacion, true);
  assert.equal(await readFile(env.STATE_FILE, "utf8"), before);
  assert.equal(snapshot.polizas.length, 0);
});

test("consulta de estado devuelve disponibilidad sin inventar una cotización", async (t) => {
  const env = await fixture(t);
  const result = await askAgent(env, "¿Cómo está el exchange?", async () => ({ functionCalls: [{ name: "consultarEstado", args: {} }] }));
  assert.equal(result.compraPropuesta, null);
  assert.equal(result.estado.exchangeCaido, false);
  assert.deepEqual(result.herramientasUtilizadas, ["consultarEstado"]);
});

test("rechaza herramientas peligrosas y argumentos manipulados sin ejecutar acciones", async (t) => {
  const env = await fixture(t);
  await readSimulationSnapshot(env.STATE_FILE);
  const before = await readFile(env.STATE_FILE, "utf8");
  for (const functionCalls of [
    [{ name: "payout", args: { polizaId: "1" } }],
    [{ name: "cotizarCobertura", args: { servicioId: 1, horas: 25 } }],
    [{ name: "cotizarCobertura", args: { servicioId: 1, horas: "4" } }],
    [{ name: "cotizarCobertura", args: { servicioId: 1, horas: 4, prima: "0.000001" } }],
    [{ name: "consultarEstado", args: { destino: "otra-wallet" } }],
    [],
  ]) {
    await assert.rejects(askAgent(env, "Compra sin confirmar", async () => ({ functionCalls })),
      (error: unknown) => error instanceof ApiError && error.codigo === "GEMINI_RESPONSE_INVALID");
  }
  assert.equal(await readFile(env.STATE_FILE, "utf8"), before);
});

test("una caída durante la consulta impide proponer una compra", async (t) => {
  const env = await fixture(t);
  const result = await askAgent(env, "Quiero cuatro horas", async () => {
    await updateSimulationSnapshot(env.STATE_FILE, (snapshot) => { snapshot.exchangeCaido = true; });
    return quoteCaller(env, "", new AbortController().signal);
  });
  assert.equal(result.compraPropuesta, null);
  assert.equal(result.estado.exchangeCaido, true);
  assert.match(result.mensaje, /caída/);
});

test("sin clave no llama al modelo ni presenta una respuesta simulada como IA", async (t) => {
  const env = await fixture(t);
  let called = false;
  await assert.rejects(askAgent({ ...env, GEMINI_API_KEY: undefined }, "Cuatro horas", async () => {
    called = true; return {};
  }), (error: unknown) => error instanceof ApiError && error.codigo === "GEMINI_NOT_CONFIGURED");
  assert.equal(called, false);
});

test("errores del proveedor y cuota se devuelven sin revelar su mensaje privado", async (t) => {
  const env = await fixture(t);
  for (const [status, code, expectedStatus] of [[429, "GEMINI_QUOTA", 429], [403, "GEMINI_CONFIGURATION", 503], [500, "GEMINI_UNAVAILABLE", 503]] as const) {
    await assert.rejects(askAgent(env, "Cuatro horas", async () => { throw { status, message: "clave-privada-no-publicar" }; }), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.codigo, code);
      assert.equal(error.status, expectedStatus);
      assert.ok(!error.message.includes("clave-privada-no-publicar"));
      return true;
    });
  }
});

test("el timeout cancela la llamada y deja disponible el flujo manual", async (t) => {
  const env = await fixture(t);
  let signal: AbortSignal | undefined;
  await assert.rejects(askAgent({ ...env, GEMINI_TIMEOUT_MS: 1000 }, "Cuatro horas", async (_, __, inputSignal) => {
    signal = inputSignal;
    return new Promise(() => {});
  }), (error: unknown) => error instanceof ApiError && error.codigo === "GEMINI_TIMEOUT" && error.status === 504);
  assert.equal(signal?.aborted, true);
});

test("el SDK configura function calling y envía solo el mensaje y herramientas permitidas", async (t) => {
  const env = await fixture(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    const request = new Request(input, init);
    assert.equal(new URL(request.url).hostname, "generativelanguage.googleapis.com");
    assert.ok(request.url.includes(env.GEMINI_MODEL));
    assert.equal(request.headers.get("x-goog-api-key"), env.GEMINI_API_KEY);
    const body = await request.json();
    assert.deepEqual(body.toolConfig.functionCallingConfig.allowedFunctionNames, ["consultarEstado", "cotizarCobertura"]);
    assert.equal(body.toolConfig.functionCallingConfig.mode, "ANY");
    assert.ok(!JSON.stringify(body).includes(token));
    assert.ok(!JSON.stringify(body).includes(env.GEMINI_API_KEY!));
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "cotizarCobertura", args: { servicioId: 1, horas: 4 } } }] }, finishReason: "STOP" }] });
  });
  const result = await askAgent(env, "Cubre Exchange Demo por cuatro horas");
  assert.equal(calls, 1);
  assert.equal(result.compraPropuesta!.prima, "0.004");
});

test("el SDK no repite automáticamente peticiones cuando Google responde cuota agotada", async (t) => {
  const env = await fixture(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ error: { code: 429, message: "cuota-privada", status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
  });
  await assert.rejects(askAgent(env, "Cuatro horas"), (error: unknown) => error instanceof ApiError && error.codigo === "GEMINI_QUOTA");
  assert.equal(calls, 1);
});

test("la ruta valida autorización, mensaje y falta de clave sin requerir contrato", async (t) => {
  const env = await fixture(t);
  const previous = process.env;
  process.env = { NODE_ENV: "test", BACKEND_MODE: "simulado", STATE_FILE: env.STATE_FILE, DEMO_API_TOKEN: token };
  t.after(() => { process.env = previous; });
  const request = (mensaje: string, auth = true) => new Request("http://localhost/api/chat", { method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ mensaje }),
  });
  assert.equal((await POST(request("Cuatro horas", false))).status, 401);
  assert.equal((await POST(request("   "))).status, 400);
  const response = await POST(request("Cuatro horas"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error.codigo, "GEMINI_NOT_CONFIGURED");
  assert.equal(body.iaDisponible, false);
  assert.equal(body.compraPropuesta, null);
});
