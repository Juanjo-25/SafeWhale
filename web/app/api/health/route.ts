import { getServerEnvironment } from "../../../lib/env";
import { configurationStatus, EnvironmentError } from "../../../lib/env-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json({ ok: true, servicio: "downtime-cover-backend", ...configurationStatus(getServerEnvironment()) }, { headers });
  } catch (error) {
    return Response.json({
      ok: false,
      error: { codigo: "ENV_INVALID", mensaje: "La configuración del backend requiere revisión." },
      ...(error instanceof EnvironmentError ? { variables: error.variables } : {}),
    }, { status: 503, headers });
  }
}
