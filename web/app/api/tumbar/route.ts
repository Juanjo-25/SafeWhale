import { simulationMutation } from "../../../lib/api";
import { dropSimulationExchange, serviceSchema } from "../../../lib/contract";

export const runtime = "nodejs";

export function POST(request: Request) {
  return simulationMutation(request, serviceSchema, dropSimulationExchange);
}
