import { configurationStatus, EnvironmentError, requireCapability } from "../web/lib/env-schema.ts";
import { loadBackendEnvironment } from "./load-env.ts";

try {
  const capability = process.argv[2];
  if (capability && capability !== "testnet" && capability !== "gemini") {
    throw new Error("Uso: pnpm check:env [testnet|gemini]");
  }
  const { env } = loadBackendEnvironment();
  if (capability === "testnet" || capability === "gemini") requireCapability(env, capability);
  console.log(JSON.stringify({ ok: true, ...configurationStatus(env), comprobacion: "configuracion_local_sin_llamadas_de_red" }, null, 2));
} catch (error) {
  const message = error instanceof EnvironmentError
    ? error.message
    : "No se pudo comprobar el entorno. Usa pnpm env:init y revisa la configuración.";
  console.error(message);
  process.exitCode = 1;
}
