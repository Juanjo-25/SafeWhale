import { simulationMutation } from "../../../lib/api";
import { emptySchema, stopSimulationPayouts } from "../../../lib/contract";

export const runtime = "nodejs";

export function POST(request: Request) {
  return simulationMutation(request, emptySchema, (env, key) => stopSimulationPayouts(env, key));
}
