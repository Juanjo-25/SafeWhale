import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from 'node:url';
import { EnvironmentError } from "../web/lib/env-schema.ts";
import { loadBackendEnvironment, webDirectory } from "./load-env.ts";

// Arranque local: fijar el puerto evita que Next elija otro y el monitor consulte
// por accidente un servicio distinto. Si está ocupado, Next debe fallar.
try {
  const command = process.argv[2];
  if (command !== "dev" && command !== "start") throw new Error("Comando de servidor inválido.");
  if (!process.env.NODE_ENV) {
    process.env = { ...process.env, NODE_ENV: command === "dev" ? "development" : "production" };
  }
  const { env, stateFile } = loadBackendEnvironment();
  const base = new URL(env.APP_BASE_URL);
  if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname) ||
      base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new EnvironmentError(["APP_BASE_URL"]);
  }
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  const port = base.port || "80";
  const args = [nextBin, command, webDirectory, "--hostname", "127.0.0.1", "--port", port];
  // Compilar las rutas API bajo demanda mientras P3 prepara página y layout.
  if (command === "dev") args.push("--webpack");
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, STATE_FILE: stateFile },
  });
  const monitor = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx',
    fileURLToPath(new URL('./monitor.ts', import.meta.url))], {
    stdio: 'inherit', env: { ...process.env, STATE_FILE: stateFile },
  });
  monitor.on('error', () => { console.error('No se pudo iniciar el monitor. Ejecuta pnpm monitor.'); });
  monitor.on('exit', (code) => { if (code && !child.killed) console.error('El monitor se detuvo. Revisa pnpm monitor.'); });
  child.on("error", () => {
    console.error("No se pudo iniciar Next.js. Comprueba pnpm install y el puerto configurado.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => { monitor.kill('SIGTERM'); process.exitCode = code ?? 1; });
  process.on("SIGINT", () => { child.kill("SIGINT"); monitor.kill('SIGINT'); });
  process.on("SIGTERM", () => { child.kill("SIGTERM"); monitor.kill('SIGTERM'); });
} catch (error) {
  console.error(error instanceof EnvironmentError ? error.message : "No se pudo iniciar el servidor local. Revisa la configuración.");
  process.exitCode = 1;
}
