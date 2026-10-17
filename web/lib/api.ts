import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnvironment } from "./env";
import { EnvironmentError, type BackendEnvironment } from "./env-schema";
import { StateError, type SimulationMutationResult } from "./state";

const headers = { "Cache-Control": "no-store" };
const idempotencyKey = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_:-]+$/);

export class ApiError extends Error {
  constructor(readonly codigo: string, mensaje: string, readonly status = 400) {
    super(mensaje);
    this.name = "ApiError";
  }
}

export function localSimulationEnvironment(): BackendEnvironment {
  const env = getServerEnvironment();
  if (env.BACKEND_MODE !== "simulado") throw new ApiError("TESTNET_PENDING", "La integración con el contrato testnet todavía no está implementada.", 503);
  if (process.env.VERCEL === "1") throw new ApiError("LOCAL_STORAGE_UNSUPPORTED", "Esta demo requiere un servidor local persistente.", 503);
  return env;
}

export function apiErrorResponse(error: unknown): Response {
  const codigo = error instanceof EnvironmentError ? "ENV_INVALID"
    : error instanceof ApiError || error instanceof StateError ? error.codigo : "INTERNAL_ERROR";
  const mensaje = error instanceof EnvironmentError ? "La configuración del backend requiere revisión."
    : error instanceof ApiError || error instanceof StateError ? error.message : "No se pudo completar la operación.";
  return Response.json({ ok: false, error: { codigo, mensaje }, txHash: null,
    ...(error instanceof EnvironmentError ? { variables: error.variables } : {}),
  }, { status: error instanceof ApiError ? error.status : 503, headers });
}

export function authorizeDemoRequest(request: Request, env: BackendEnvironment): void {
  if (!env.DEMO_API_TOKEN) throw new ApiError("DEMO_TOKEN_MISSING", "Configura DEMO_API_TOKEN para habilitar acciones de demo.", 503);
  const supplied = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(env.DEMO_API_TOKEN);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError("UNAUTHORIZED", "Se requiere autorización para esta acción de demo.", 401);
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError("CONTENT_TYPE_INVALID", "Envía el body como application/json.", 415);
  }
  if (!request.body) throw new ApiError("BODY_INVALID", "Se requiere un body JSON.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel().catch(() => {});
        throw new ApiError("BODY_TOO_LARGE", "El body supera el límite de 4 KB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
    throw new ApiError("BODY_INVALID", "El body debe contener JSON válido.");
  }
}

export type MutationOutcome = { status: 200 | 201; resultado: SimulationMutationResult; replayed: boolean };

export async function simulationMutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  action: (env: BackendEnvironment, key: string, input: T) => Promise<MutationOutcome>,
): Promise<Response> {
  try {
    const env = localSimulationEnvironment();
    authorizeDemoRequest(request, env);
    const key = idempotencyKey.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new ApiError("IDEMPOTENCY_KEY_INVALID", "Incluye una Idempotency-Key única de 8 a 128 caracteres.");
    const input = schema.safeParse(await readJsonBody(request));
    if (!input.success) throw new ApiError("BODY_INVALID", "Los datos enviados no cumplen el formato de esta operación.");
    const outcome = await action(env, key.data, input.data);
    return Response.json(outcome.resultado, { status: outcome.status, headers: {
      ...headers, "Idempotency-Replayed": String(outcome.replayed),
    } });
  } catch (error) { return apiErrorResponse(error); }
}
