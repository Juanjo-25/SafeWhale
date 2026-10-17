import "server-only";
import { FunctionCallingConfigMode, GoogleGenAI, type FunctionCall, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { ApiError } from "./api";
import { assertSimulationPurchaseAvailable, emptySchema, purchaseSchema, quoteSimulationCover } from "./contract";
import type { BackendEnvironment } from "./env-schema";
import { publicSimulationState, readSimulationSnapshot } from "./state";

export const chatSchema = z.object({ mensaje: z.string().trim().min(1).max(1000) }).strict();
const actionSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("consultarEstado"), args: emptySchema.default({}) }),
  z.object({ name: z.literal("cotizarCobertura"), args: purchaseSchema }),
]);
const actionsSchema = z.array(actionSchema).min(1).max(2).refine((actions) => new Set(actions.map((action) => action.name)).size === actions.length);

const declarations: FunctionDeclaration[] = [
  { name: "consultarEstado", description: "Consulta disponibilidad y condiciones de Exchange Demo. Úsala si falta la duración, se pregunta por el estado o se pide algo distinto de una cotización válida." },
  { name: "cotizarCobertura", description: "Prepara una cotización cuando el usuario indica explícitamente una duración entera entre 1 y 24 horas para Exchange Demo. No compra ni paga.", parametersJsonSchema: {
    type: "object", properties: { servicioId: { type: "integer", enum: [1] }, horas: { type: "integer", minimum: 1, maximum: 24 } },
    required: ["servicioId", "horas"], additionalProperties: false,
  } },
];

export type ToolCaller = (env: BackendEnvironment, mensaje: string, signal: AbortSignal) => Promise<{ functionCalls?: FunctionCall[] }>;

const callGemini: ToolCaller = async (env, mensaje, signal) => {
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, vertexai: false,
    httpOptions: { timeout: env.GEMINI_TIMEOUT_MS, retryOptions: { attempts: 1 } },
  });
  const response = await client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: mensaje,
    config: {
      abortSignal: signal,
      systemInstruction: "Eres el intérprete del chat de Downtime Cover. Solo existe Exchange Demo (servicioId 1), con duración de 1 a 24 horas. Selecciona las herramientas declaradas. Si faltan horas explícitas o el servicio no está soportado, consulta el estado para orientar al usuario. Nunca inventes duración, importes ni permisos. Nunca compres, transfieras o controles el agente. Cada herramienta puede llamarse como máximo una vez. La cobertura y sus saldos son simulados en esta etapa.",
      tools: [{ functionDeclarations: declarations }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: ["consultarEstado", "cotizarCobertura"] } },
      maxOutputTokens: 1024,
    },
  });
  return { functionCalls: response.functionCalls };
};

async function selectTools(env: BackendEnvironment, mensaje: string, caller: ToolCaller) {
  if (!env.GEMINI_API_KEY) throw new ApiError("GEMINI_NOT_CONFIGURED", "Configura GEMINI_API_KEY en el servidor. Puedes continuar con los botones manuales.", 503);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError("GEMINI_TIMEOUT", "Gemini tardó demasiado. Puedes continuar con los botones manuales.", 504));
      controller.abort();
    }, env.GEMINI_TIMEOUT_MS);
  });
  try {
    return await Promise.race([caller(env, mensaje, controller.signal), deadline]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    if (status === 429) throw new ApiError("GEMINI_QUOTA", "Se alcanzó la cuota de Gemini. Puedes continuar con los botones manuales.", 429);
    if ([400, 401, 403, 404].includes(Number(status))) throw new ApiError("GEMINI_CONFIGURATION", "Revisa la API key y la disponibilidad de GEMINI_MODEL en Google AI Studio.", 503);
    throw new ApiError("GEMINI_UNAVAILABLE", "Gemini no está disponible. Puedes continuar con los botones manuales.", 503);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function askAgent(env: BackendEnvironment, mensaje: string, caller: ToolCaller = callGemini) {
  if (env.BACKEND_MODE !== "simulado") throw new ApiError("TESTNET_PENDING", "Las cotizaciones del contrato testnet todavía no están implementadas.", 503);
  const response = await selectTools(env, mensaje, caller);
  const parsed = actionsSchema.safeParse(response.functionCalls?.map((call) => ({ name: call.name, args: call.args })));
  if (!parsed.success) throw new ApiError("GEMINI_RESPONSE_INVALID", "Gemini devolvió una herramienta o argumentos no permitidos. Reintenta o usa los botones manuales.", 502);

  // El modelo interpreta la solicitud. Las cifras y el texto transaccional se
  // construyen desde reglas del backend, sin usar texto libre del modelo.
  const snapshot = await readSimulationSnapshot(env.STATE_FILE);
  const estado = publicSimulationState(snapshot);
  const base = { ok: true, modo: "simulado" as const, iaDisponible: true, proveedorIA: "gemini" as const,
    herramientasUtilizadas: parsed.data.map((action) => action.name), txHash: null,
  };
  const quoteAction = parsed.data.find((action) => action.name === "cotizarCobertura");
  if (quoteAction) {
    try { assertSimulationPurchaseAvailable(snapshot); } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { ...base, mensaje: error.message, compraPropuesta: null, estado };
    }
    const quote = quoteSimulationCover(quoteAction.args);
    return { ...base,
      mensaje: `La cobertura simulada de Exchange Demo por ${quote.horas} ${quote.horas === 1 ? "hora cuesta" : "horas cuesta"} ${quote.prima} MON. El pago fijo previsto es ${quote.pagoFijo} MON, sujeto a las condiciones y topes de la demo. Confirma la compra para crear la póliza.`,
      compraPropuesta: quote, estado,
    };
  }
  return { ...base,
    mensaje: `Exchange Demo está ${snapshot.exchangeCaido ? "caído y no admite nuevas coberturas" : "disponible"}. Puedo cotizar coberturas simuladas de 1 a 24 horas; indica la duración que necesitas.`,
    compraPropuesta: null, estado,
  };
}
