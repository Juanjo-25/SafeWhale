import { apiErrorResponse, localSimulationEnvironment } from "../../../lib/api";
import { readSimulationSnapshot } from "../../../lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = localSimulationEnvironment();
    const snapshot = await readSimulationSnapshot(env.STATE_FILE);
    return Response.json({ modo: "simulado", servicioId: 1, disponible: !snapshot.exchangeCaido, caidaDesde: snapshot.caidaIniciadaEn }, {
      status: snapshot.exchangeCaido ? 503 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return apiErrorResponse(error); }
}
