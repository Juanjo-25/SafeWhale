import { getServerEnvironment } from "../../../../web/lib/env";
import { configurationStatus, EnvironmentError } from "../../../../web/lib/env-schema";
import { checkDatabase } from '../../../../web/lib/postgres-store';
import { StateError } from '../../../../web/lib/state-error';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const env = getServerEnvironment();
    const baseDatos = env.STORAGE_BACKEND === 'supabase' ? await checkDatabase(env) : { conectado: false };
    return Response.json({ ok: true, servicio: "downtime-cover-backend", ...configurationStatus(env), baseDatos }, { headers });
  } catch (error) {
    return Response.json({
      ok: false,
      error: { codigo: error instanceof StateError ? error.codigo : "ENV_INVALID",
        mensaje: error instanceof StateError ? error.message : "La configuración del backend requiere revisión." },
      ...(error instanceof EnvironmentError ? { variables: error.variables } : {}),
    }, { status: 503, headers });
  }
}

export const maxDuration = 300;
