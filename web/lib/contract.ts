import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { formatEther, parseEther, Wallet } from "ethers";
import { z } from "zod";
import { ApiError, type MutationOutcome } from "./api";
import type { BackendEnvironment } from "./env-schema";
import { updateSimulationSnapshot, type SimulationMutationResult, type SimulationSnapshot } from "./state";

// Parámetros provisionales de INTERFAZ.md. P1 publicará los definitivos en shared/.
const simulation = { service: 1, pricePerHour: parseEther("0.001"), payout: "0.01", maxActivePolicies: 50 };
const simulatedOwner = "0x0000000000000000000000000000000000000001";

export const purchaseSchema = z.object({ servicioId: z.literal(1), horas: z.number().int().min(1).max(24) }).strict();
export const serviceSchema = z.object({ servicioId: z.literal(1) }).strict();
export const emptySchema = z.object({}).strict();

export function quoteSimulationCover(input: z.infer<typeof purchaseSchema>) {
  const validated = purchaseSchema.parse(input);
  return {
    servicioId: validated.servicioId,
    horas: validated.horas,
    prima: formatEther(simulation.pricePerHour * BigInt(validated.horas)),
    pagoFijo: simulation.payout,
    moneda: "MON" as const,
    requiereConfirmacion: true as const,
  };
}

export function assertSimulationPurchaseAvailable(snapshot: SimulationSnapshot, now = Math.floor(Date.now() / 1000)) {
  if (snapshot.exchangeCaido) throw new ApiError("EXCHANGE_DOWN", "No se puede comprar cobertura durante la caída del servicio.", 409);
  const active = snapshot.polizas.filter((policy) => policy.estado === "Activa" && policy.fin > now).length;
  if (active >= simulation.maxActivePolicies) throw new ApiError("POLICY_LIMIT", "Se alcanzó el máximo de 50 pólizas activas.", 409);
}

function event(snapshot: SimulationSnapshot, tipo: string, now: number, polizaId: string | null = null) {
  snapshot.eventos.push({ id: `evt-${randomUUID()}`, tipo, polizaId, txHash: null, timestamp: now, ok: true, motivo: null, origen: "simulado" });
}

async function mutate(
  env: BackendEnvironment, key: string, operation: string, input: unknown, status: 200 | 201,
  execute: (snapshot: SimulationSnapshot, now: number) => Omit<SimulationMutationResult, "ok" | "modo" | "txHash" | "duracionMs">,
): Promise<MutationOutcome> {
  if (env.BACKEND_MODE !== "simulado") throw new ApiError("TESTNET_PENDING", "Esta operación solo implementa la simulación local.", 503);
  const started = performance.now();
  const fingerprint = createHash("sha256").update(JSON.stringify({ operation, input })).digest("hex");
  return updateSimulationSnapshot(env.STATE_FILE, (snapshot) => {
    const existing = snapshot.idempotencia.find((record) => record.key === key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ApiError("IDEMPOTENCY_CONFLICT", "Esta Idempotency-Key ya se usó para otra operación o datos.", 409);
      return { status: existing.status, resultado: existing.resultado, replayed: true };
    }
    const fields = execute(snapshot, Math.floor(Date.now() / 1000));
    const resultado: SimulationMutationResult = {
      ok: true, modo: "simulado", txHash: null,
      duracionMs: Math.round((performance.now() - started) * 100) / 100,
      ...fields,
    };
    snapshot.idempotencia.push({ key, fingerprint, status, resultado });
    return { status, resultado, replayed: false };
  });
}

export async function buySimulationCover(env: BackendEnvironment, key: string, input: z.infer<typeof purchaseSchema>) {
  const owner = env.DEMO_USER_PRIVATE_KEY ? new Wallet(env.DEMO_USER_PRIVATE_KEY).address : simulatedOwner;
  return mutate(env, key, "comprar", { ...input, dueno: owner }, 201, (snapshot, now) => {
    assertSimulationPurchaseAvailable(snapshot, now);
    const quote = quoteSimulationCover(input);
    const nextId = snapshot.polizas.reduce((max, policy) => BigInt(policy.id) > max ? BigInt(policy.id) : max, 0n) + 1n;
    const premium = parseEther(quote.prima);
    const policy = { id: nextId.toString(), dueno: owner, servicioId: simulation.service, inicio: now, fin: now + input.horas * 3600, estado: "Activa" as const };
    snapshot.polizas.push(policy);
    snapshot.fondo = formatEther(parseEther(snapshot.fondo) + premium);
    event(snapshot, "CoverComprada", now, policy.id);
    return { poliza: policy, prima: quote.prima, pagoFijo: quote.pagoFijo };
  });
}

export async function dropSimulationExchange(env: BackendEnvironment, key: string, input: z.infer<typeof serviceSchema>) {
  return mutate(env, key, "tumbar", input, 200, (snapshot, now) => {
    if (!snapshot.exchangeCaido) {
      snapshot.exchangeCaido = true;
      snapshot.caidaIniciadaEn = now;
      event(snapshot, "ExchangeCaido", now);
    }
    return { exchangeCaido: true, caidaDesde: snapshot.caidaIniciadaEn };
  });
}

export async function stopSimulationPayouts(env: BackendEnvironment, key: string) {
  return mutate(env, key, "apagar-agente", {}, 200, (snapshot, now) => {
    if (snapshot.agenteActivo) {
      snapshot.agenteActivo = false;
      event(snapshot, "AgenteApagado", now);
    }
    return { agenteActivo: false };
  });
}
