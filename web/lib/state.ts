import "server-only";
import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import { z } from "zod";
import lockfile from "proper-lockfile";

const id = z.string().regex(/^(0|[1-9]\d*)$/);
const money = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const policySchema = z.object({
  id,
  dueno: z.string().refine((value) => isAddress(value) && getAddress(value) !== ZeroAddress),
  servicioId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  inicio: timestamp,
  fin: timestamp,
  estado: z.enum(["Activa", "Pagada", "Expirada"]),
}).refine((policy) => policy.fin > policy.inicio);

const eventSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().min(1),
  polizaId: id.nullable(),
  txHash: z.null(),
  timestamp,
  ok: z.boolean(),
  motivo: z.string().nullable(),
  origen: z.literal("simulado"),
});

const mutationResultSchema = z.object({
  ok: z.literal(true),
  modo: z.literal("simulado"),
  txHash: z.null(),
  duracionMs: z.number().nonnegative(),
  poliza: policySchema.optional(),
  prima: money.optional(),
  pagoFijo: money.optional(),
  agenteActivo: z.boolean().optional(),
  exchangeCaido: z.boolean().optional(),
  caidaDesde: timestamp.nullable().optional(),
});

const idempotencySchema = z.object({
  key: z.string().min(8).max(128),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.union([z.literal(200), z.literal(201)]),
  resultado: mutationResultSchema,
});

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  fondo: money,
  bono: money,
  agenteActivo: z.boolean(),
  exchangeCaido: z.boolean(),
  caidaIniciadaEn: timestamp.nullable().default(null),
  polizas: z.array(policySchema).refine((policies) => new Set(policies.map((policy) => policy.id)).size === policies.length),
  eventos: z.array(eventSchema),
  idempotencia: z.array(idempotencySchema).default([]),
});

export type SimulationSnapshot = z.infer<typeof snapshotSchema>;
export type SimulationMutationResult = z.infer<typeof mutationResultSchema>;

export class StateError extends Error {
  constructor(readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "StateError";
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function initialSnapshot(): SimulationSnapshot {
  return {
    schemaVersion: 1,
    fondo: "1.000",
    bono: "0.500",
    agenteActivo: true,
    exchangeCaido: false,
    caidaIniciadaEn: null,
    polizas: [],
    eventos: [],
    idempotencia: [],
  };
}

// Todas las mutaciones de API/monitor deben pasar por esta función. No mantener
// el bloqueo mientras se llama a Gemini o a un RPC: aquí solo se modifica JSON.
export async function updateSimulationSnapshot<T>(file: string, update: (snapshot: SimulationSnapshot) => T): Promise<T> {
  await readSimulationSnapshot(file);
  let compromised = false;
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(file, {
      realpath: false,
      stale: 10000,
      update: 2000,
      retries: { retries: 50, minTimeout: 10, maxTimeout: 100, factor: 1.2, randomize: true },
      onCompromised: () => { compromised = true; },
    });
  } catch {
    throw new StateError("STATE_BUSY", "El estado está ocupado. Reintenta con la misma Idempotency-Key.");
  }

  const temporary = `${file}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const snapshot = await readSimulationSnapshot(file);
    const result = update(snapshot);
    const parsed = snapshotSchema.safeParse(snapshot);
    if (!parsed.success) throw new StateError("STATE_INVALID", "El cambio de estado no es válido y no fue guardado.");
    if (compromised) throw new StateError("STATE_BUSY", "No se pudo conservar el bloqueo del estado.");
    try {
      await writeFile(temporary, `${JSON.stringify(parsed.data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      created = true;
      if (compromised) throw new StateError("STATE_BUSY", "No se pudo conservar el bloqueo del estado.");
      await rename(temporary, file);
      created = false;
    } catch (error) {
      if (error instanceof StateError) throw error;
      throw new StateError("STATE_UNAVAILABLE", "No se pudo guardar el estado local. Reintenta con la misma Idempotency-Key.");
    }
    return result;
  } finally {
    try {
      if (created) await unlink(temporary);
    } finally {
      try { await release(); } catch {
        throw new StateError("STATE_BUSY", "No se pudo liberar el estado. Reintenta con la misma Idempotency-Key.");
      }
    }
  }
}

async function initializeSnapshot(file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let created = false;
  try {
    await writeFile(temporary, `${JSON.stringify(initialSnapshot(), null, 2)}\n`, { flag: "wx", mode: 0o600 });
    created = true;
    try {
      // Publicar un archivo completo y no reemplazar el estado si otro proceso
      // lo creó mientras atendíamos la primera petición.
      await link(temporary, file);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
  } finally {
    if (created) await unlink(temporary);
  }
}

export async function readSimulationSnapshot(file: string): Promise<SimulationSnapshot> {
  if (!isAbsolute(file)) {
    throw new StateError("STATE_PATH_INVALID", "Inicia el backend con pnpm dev para resolver la ruta compartida del estado.");
  }
  let contents: string;
  try {
    try {
      contents = await readFile(file, "utf8");
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      await initializeSnapshot(file);
      contents = await readFile(file, "utf8");
    }
  } catch {
    throw new StateError("STATE_UNAVAILABLE", "No se pudo acceder al estado local. Revisa los permisos y STATE_FILE.");
  }

  try {
    // Descartar campos ajenos al esquema antes de construir una respuesta pública.
    // Un archivo corrupto se conserva; nunca se sustituye por balances iniciales.
    return snapshotSchema.parse(JSON.parse(contents));
  } catch {
    throw new StateError("STATE_INVALID", "El estado local no es válido. Revisa el archivo sin eliminar las pólizas existentes.");
  }
}

export function publicSimulationState(snapshot: SimulationSnapshot, now = Math.floor(Date.now() / 1000)) {
  return {
    modo: "simulado" as const,
    chainId: 10143,
    contrato: null,
    fondo: snapshot.fondo,
    bono: snapshot.bono,
    agenteActivo: snapshot.agenteActivo,
    exchangeCaido: snapshot.exchangeCaido,
    polizas: snapshot.polizas.map((policy) => ({
      ...policy,
      estado: policy.estado === "Activa" && policy.fin <= now ? "Expirada" as const : policy.estado,
    })),
    eventos: snapshot.eventos,
  };
}
