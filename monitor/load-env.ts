import nextEnv from "@next/env";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvironment } from "../web/lib/env-schema.ts";

export const webDirectory = fileURLToPath(new URL("../web/", import.meta.url));

export function loadBackendEnvironment() {
  // Misma carpeta y precedencia .env que usa `next dev web`.
  const development = process.env.NODE_ENV !== "production";
  nextEnv.loadEnvConfig(webDirectory, development, {
    info: () => {},
    error: () => { throw new Error("No se pudo cargar el archivo de entorno del backend."); },
  });
  const env = parseEnvironment(process.env);
  return { env, stateFile: resolve(webDirectory, env.STATE_FILE) };
}
