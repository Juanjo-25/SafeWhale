import { askAgent, chatSchema } from "../../../../web/lib/agent";
import { ApiError, apiErrorResponse, authorizeDemoRequest, backendEnvironment, readJsonBody } from "../../../../web/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = backendEnvironment();
    authorizeDemoRequest(request, env);
    const input = chatSchema.safeParse(await readJsonBody(request));
    if (!input.success) throw new ApiError("BODY_INVALID", "Envía un mensaje de 1 a 1000 caracteres.");
    return Response.json(await askAgent(env, input.data.mensaje), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json({ ...await response.json(), iaDisponible: false, compraPropuesta: null }, {
      status: response.status, headers: { "Cache-Control": "no-store" },
    });
  }
}

export const maxDuration = 300;
