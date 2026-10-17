import { getServerEnvironment } from "../../../lib/env";
import { EnvironmentError } from "../../../lib/env-schema";
import { publicSimulationState, readSimulationSnapshot, StateError } from "../../../lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const env = getServerEnvironment();
    if (env.BACKEND_MODE !== "simulado") {
      throw new StateError("TESTNET_PENDING", "La lectura del contrato testnet todavía no está implementada.");
    }
    if (process.env.VERCEL === "1") {
      throw new StateError("LOCAL_STORAGE_UNSUPPORTED", "El estado de esta demo requiere un servidor local persistente.");
    }
    const snapshot = await readSimulationSnapshot(env.STATE_FILE);
    return Response.json(publicSimulationState(snapshot), { headers });
  } catch (error) {
    const codigo = error instanceof EnvironmentError ? "ENV_INVALID"
      : error instanceof StateError ? error.codigo : "STATE_UNAVAILABLE";
    const mensaje = error instanceof EnvironmentError
      ? "La configuración del backend requiere revisión."
      : error instanceof StateError ? error.message : "No se pudo obtener el estado del backend.";
    return Response.json({
      ok: false,
      error: { codigo, mensaje },
      txHash: null,
      ...(error instanceof EnvironmentError ? { variables: error.variables } : {}),
    }, { status: 503, headers });
  }
}
