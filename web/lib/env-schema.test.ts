import assert from "node:assert/strict";
import { test } from "node:test";
import { configurationStatus, EnvironmentError, parseEnvironment, requireCapability } from "./env-schema.ts";

// Datos sintéticos de pruebas; no son wallets ni credenciales de la demo.
const agentKey = `0x${"1".padStart(64, "0")}`;
const userKey = `0x${"2".padStart(64, "0")}`;
const testnet = {
  BACKEND_MODE: "testnet",
  CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
  AGENT_PRIVATE_KEY: agentKey,
  DEMO_USER_PRIVATE_KEY: userKey,
  DEMO_API_TOKEN: "token-sintetico-para-pruebas-000000000",
};

test("el modo simulado arranca con credenciales vacías sin declararlas disponibles", () => {
  const env = parseEnvironment({ CONTRACT_ADDRESS: "", AGENT_PRIVATE_KEY: "", DEMO_USER_PRIVATE_KEY: "", GEMINI_API_KEY: "", DEMO_API_TOKEN: "" });
  assert.deepEqual(configurationStatus(env), { modo: "simulado", chainId: 10143, configurado: { testnet: false, gemini: false, controlesDemo: false } });
});

test("testnet falla antes de habilitar firma si falta configuración", () => {
  assert.throws(() => parseEnvironment({ BACKEND_MODE: "testnet" }), (error: unknown) => {
    assert.ok(error instanceof EnvironmentError);
    assert.deepEqual(error.variables, ["AGENT_PRIVATE_KEY", "CONTRACT_ADDRESS", "DEMO_API_TOKEN", "DEMO_USER_PRIVATE_KEY"]);
    return true;
  });
});

test("rechaza otra red, llaves fuera de rango, dirección cero y polling demasiado rápido", () => {
  for (const source of [
    { MONAD_CHAIN_ID: "1" },
    { AGENT_PRIVATE_KEY: `0x${"0".repeat(64)}` },
    { AGENT_PRIVATE_KEY: `0x${"f".repeat(64)}` },
    { CONTRACT_ADDRESS: `0x${"0".repeat(40)}` },
    { MONITOR_INTERVAL_MS: "100" },
    { MONAD_RPC_URL: "http://example.com/rpc" },
  ]) assert.throws(() => parseEnvironment(source), EnvironmentError);
});

test("mantiene separados usuario y agente", () => {
  assert.throws(() => parseEnvironment({ ...testnet, DEMO_USER_PRIVATE_KEY: agentKey }), EnvironmentError);
});

test("un error de validación nunca incluye el valor privado recibido", () => {
  const secret = "valor-privado-invalido-que-no-debe-salir";
  assert.throws(() => parseEnvironment({ AGENT_PRIVATE_KEY: secret }), (error: unknown) => {
    assert.ok(error instanceof EnvironmentError);
    assert.ok(error.message.includes("AGENT_PRIVATE_KEY"));
    assert.ok(!error.message.includes(secret));
    assert.ok(!JSON.stringify(error).includes(secret));
    return true;
  });
});

test("Gemini requiere clave incluso si el modo simulado puede arrancar sin ella", () => {
  assert.throws(() => requireCapability(parseEnvironment({}), "gemini"), EnvironmentError);
  requireCapability(parseEnvironment({ GEMINI_API_KEY: "clave-sintetica" }), "gemini");
});

test("el estado público expone disponibilidad local y no valores secretos", () => {
  const env = parseEnvironment({ ...testnet, GEMINI_API_KEY: "clave-sintetica", MONAD_RPC_URL: "https://example.com/rpc?token=privado" });
  const status = configurationStatus(env);
  assert.equal(status.configurado.testnet, true);
  assert.equal(status.configurado.gemini, true);
  const serialized = JSON.stringify(status);
  for (const secret of [agentKey, userKey, testnet.DEMO_API_TOKEN, "clave-sintetica", "token=privado"]) {
    assert.ok(!serialized.includes(secret));
  }
});
