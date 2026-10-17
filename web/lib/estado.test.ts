import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { GET as stateRoute } from "../../api/app/api/estado/route.ts";
function GET() { return stateRoute(new Request('http://localhost/api/estado')); }

async function routeFixture(t: TestContext, extra: Partial<NodeJS.ProcessEnv> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "downtime-estado-"));
  const previous = process.env;
  process.env = { ...extra, NODE_ENV: "test", BACKEND_MODE: extra.BACKEND_MODE ?? "simulado", STATE_FILE: join(directory, "state.json") };
  t.after(async () => {
    process.env = previous;
    await rm(directory, { recursive: true, force: true });
  });
  return process.env.STATE_FILE!;
}

test("GET devuelve el contrato de datos para P3 sin caché ni pólizas inventadas", async (t) => {
  await routeFixture(t);
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    modo: "simulado", chainId: 10143, contrato: null, autorizado: true,
    fondo: "1.000", bono: "0.500", agenteActivo: true, exchangeCaido: false,
    polizas: [], eventos: [], caidaIniciadaEn: null,
    servicios: [{ id: 1, nombre: "Exchange Demo", tipo: "Exchange", caido: false, caidaIniciadaEn: null }, { id: 2, nombre: "Stripe", tipo: "Pagos", caido: false, caidaIniciadaEn: null }],
    cuentaDemo: "0x0000000000000000000000000000000000000001",
    parametros: { precioHora: "0.001", indemnizacion: "0.01", umbralSeg: 10, tiempoReclamoSeg: 30, topePorEvento: 30, maxHoras: 24 },
  });
});

test("GET preserva archivos corruptos y devuelve un error seguro", async (t) => {
  const file = await routeFixture(t);
  const corrupted = "datos-privados-que-no-deben-volver-al-cliente";
  await writeFile(file, corrupted);
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error.codigo, "STATE_INVALID");
  assert.ok(!JSON.stringify(body).includes(corrupted));
  assert.equal(await readFile(file, "utf8"), corrupted);
});

test("testnet nunca cae silenciosamente en una respuesta simulada", async (t) => {
  await routeFixture(t, {
    BACKEND_MODE: "testnet",
    CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
    CONTRACT_DEPLOY_BLOCK: '0', MONAD_RPC_URL: 'http://127.0.0.1:1', RPC_TIMEOUT_MS: '1000',
    AGENT_PRIVATE_KEY: `0x${"1".padStart(64, "0")}`,
    DEMO_USER_PRIVATE_KEY: `0x${"2".padStart(64, "0")}`,
    DEMO_API_TOKEN: "token-sintetico-para-pruebas-000000000",
  });
  const response = await GET();
  assert.equal(response.status, 503);
  assert.ok(['RPC_UNAVAILABLE', 'CONTRACT_MISMATCH'].includes((await response.json()).error.codigo));
});

test("configuración inválida devuelve nombres de variables sin valores privados", async (t) => {
  const secret = "valor-privado-invalido";
  await routeFixture(t, { AGENT_PRIVATE_KEY: secret });
  const response = await GET();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.codigo, "ENV_INVALID");
  assert.deepEqual(body.variables, ["AGENT_PRIVATE_KEY"]);
  assert.ok(!JSON.stringify(body).includes(secret));
});

test("el almacenamiento local no se declara compatible con Vercel", async (t) => {
  await routeFixture(t, { VERCEL: "1" });
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.codigo, "LOCAL_STORAGE_UNSUPPORTED");
});
