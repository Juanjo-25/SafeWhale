import { getAddress, ZeroAddress } from "ethers";
import { z } from "zod";

// Este módulo es puro para poder validar sin leer archivos ni hacer llamadas de red.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => value === "" ? undefined : value, schema.optional());

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine((value) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return false;
  const scalar = BigInt(value);
  return scalar > 0n && scalar < BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
});

const address = z.string().refine((value) => {
  try {
    return getAddress(value) !== ZeroAddress;
  } catch {
    return false;
  }
});

const rpcUrl = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
});

const environmentSchema = z.object({
  BACKEND_MODE: z.enum(["simulado", "testnet"]).default("simulado"),
  MONAD_CHAIN_ID: z.coerce.number().pipe(z.literal(10143)).default(10143),
  MONAD_RPC_URL: rpcUrl.default("https://testnet-rpc.monad.xyz"),
  RPC_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  CONTRACT_ADDRESS: optional(address),
  AGENT_PRIVATE_KEY: optional(privateKey),
  DEMO_USER_PRIVATE_KEY: optional(privateKey),
  GEMINI_API_KEY: optional(z.string().min(1).regex(/^\S+$/)),
  GEMINI_MODEL: z.string().regex(/^gemini-[a-zA-Z0-9._-]+$/).default("gemini-3.5-flash-lite"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  APP_BASE_URL: z.string().url().refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }).default("http://127.0.0.1:3001"),
  MONITOR_INTERVAL_MS: z.coerce.number().int().min(2000).max(60000).default(2000),
  STATE_FILE: z.string().trim().min(1).default("../state.json"),
  DEMO_API_TOKEN: optional(z.string().min(32).regex(/^\S+$/)),
});

export type BackendEnvironment = z.infer<typeof environmentSchema>;
export type Capability = "testnet" | "gemini";

export class EnvironmentError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    const unique = [...new Set(variables)].sort();
    super(`Revisa estas variables de entorno: ${unique.join(", ")}.`);
    this.name = "EnvironmentError";
    this.variables = unique;
  }
}

export function requireCapability(env: BackendEnvironment, capability: Capability): void {
  const required: (keyof BackendEnvironment)[] = capability === "gemini"
    ? ["GEMINI_API_KEY"]
    : ["CONTRACT_ADDRESS", "AGENT_PRIVATE_KEY", "DEMO_USER_PRIVATE_KEY", "DEMO_API_TOKEN"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new EnvironmentError(missing);
}

export function parseEnvironment(source: Record<string, unknown>): BackendEnvironment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    // No propagar ZodError: puede contener valores de entrada privados.
    throw new EnvironmentError(parsed.error.issues.map((issue) => String(issue.path[0] ?? "entorno")));
  }
  const env = parsed.data;
  if (env.AGENT_PRIVATE_KEY && env.DEMO_USER_PRIVATE_KEY &&
      env.AGENT_PRIVATE_KEY.toLowerCase() === env.DEMO_USER_PRIVATE_KEY.toLowerCase()) {
    throw new EnvironmentError(["AGENT_PRIVATE_KEY", "DEMO_USER_PRIVATE_KEY"]);
  }
  if (env.BACKEND_MODE === "testnet") requireCapability(env, "testnet");
  return env;
}

// Solo presencia y validación local. No implica conexión, saldo ni permisos reales.
export function configurationStatus(env: BackendEnvironment) {
  return {
    modo: env.BACKEND_MODE,
    chainId: env.MONAD_CHAIN_ID,
    configurado: {
      testnet: Boolean(env.CONTRACT_ADDRESS && env.AGENT_PRIVATE_KEY && env.DEMO_USER_PRIVATE_KEY && env.DEMO_API_TOKEN),
      gemini: Boolean(env.GEMINI_API_KEY),
      controlesDemo: Boolean(env.DEMO_API_TOKEN),
    },
  };
}
