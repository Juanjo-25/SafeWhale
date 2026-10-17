import "server-only";
import { parseEnvironment } from "./env-schema";

export function getServerEnvironment() {
  return parseEnvironment(process.env);
}
