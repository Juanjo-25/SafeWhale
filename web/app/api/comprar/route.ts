import { simulationMutation } from "../../../lib/api";
import { buySimulationCover, purchaseSchema } from "../../../lib/contract";

export const runtime = "nodejs";

export function POST(request: Request) {
  return simulationMutation(request, purchaseSchema, buySimulationCover);
}
