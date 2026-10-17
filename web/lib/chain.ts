import 'server-only';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Contract, FetchRequest, Interface, JsonRpcProvider, Wallet, Transaction, formatEther, keccak256,
  type TransactionReceipt, type TransactionRequest } from 'ethers';
import abi from '../../shared/abi.json';
import artifact from '../../contracts/DowntimeCover (1).json';
import type { PolizaJSON, ParametrosJSON } from '../../shared/types';
import type { BackendEnvironment } from './env-schema';
import { requireCapability } from './env-schema';
import { ApiError } from './api';
import { withChainStore, type ChainStore, type ChainOperation } from './chain-store';
import { StateError } from './state-error';

const iface = new Interface(abi);
const messages: Record<string, string> = {
  SinCaida: 'No existe una caída reportada para esta póliza.', YaPagada: 'La póliza ya fue pagada.',
  FueraDeVentana: 'La caída no comenzó dentro de la cobertura.', NoEsDueno: 'La wallet de demo no es dueña de esta póliza.',
  EsperaPendiente: 'Todavía no vence la espera para reclamar.', TopeEvento: 'Se agotó el tope de pagos del evento.',
  FondoInsuficiente: 'El fondo no tiene saldo libre suficiente.', BonoInsuficiente: 'El bono del agente es insuficiente.',
  CaidaYaReportada: 'Ya existe una caída; este contrato admite un único evento.', PolizaSinReserva: 'La póliza ya no conserva un derecho de cobro.',
  PolizaInvalida: 'La póliza no existe.', DuracionInvalida: 'La duración no es válida para este contrato.',
  PrimaIncorrecta: 'La prima no coincide con la exigida por el contrato.', ServicioInvalido: 'El contrato solo admite Exchange Demo (servicio 1).',
  ReporteFueraDePlazo: 'La caída ya está fuera del plazo permitido para reportarla.',
};
function errorData(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return;
  const e = error as { data?: unknown; error?: unknown; info?: { error?: unknown } };
  if (typeof e.data === 'string') return e.data;
  if (e.data && typeof e.data === 'object' && 'result' in e.data && typeof e.data.result === 'string') return e.data.result;
  return errorData(e.error) ?? errorData(e.info?.error);
}
export function chainError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof StateError) return new ApiError(error.codigo, error.message, 503);
  try { const parsed = iface.parseError(errorData(error) ?? '0x');
    if (parsed) return new ApiError(parsed.name, messages[parsed.name] ?? `El contrato rechazó la operación: ${parsed.name}.`, 409);
  } catch { /* No publicar errores crudos del RPC. */ }
  return new ApiError('RPC_UNAVAILABLE', 'No se pudo confirmar la respuesta de Monad. Reintenta la misma acción.', 503);
}
function runtimeMatches(code: string) {
  const expected = artifact.data.deployedBytecode;
  const strip = (hex: string) => {
    const plain = hex.replace(/^0x/, '');
    const metadataBytes = parseInt(plain.slice(-4), 16) + 2;
    return plain.slice(0, -metadataBytes * 2);
  };
  const mask = (hex: string) => {
    let plain = strip(hex);
    for (const refs of Object.values(expected.immutableReferences)) for (const ref of refs) {
      const start = ref.start * 2; const length = ref.length * 2;
      plain = plain.slice(0, start) + '0'.repeat(length) + plain.slice(start + length);
    }
    return plain;
  };
  return code !== '0x' && mask(code) === mask(expected.object);
}
export function createProvider(env: BackendEnvironment) {
  const request = new FetchRequest(env.MONAD_RPC_URL); request.timeout = env.RPC_TIMEOUT_MS;
  const provider = new JsonRpcProvider(request, { chainId: env.MONAD_CHAIN_ID, name: 'Monad Testnet' },
    { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 1 });
  provider.pollingInterval = 500;
  return provider;
}
export async function createChainContext(env: BackendEnvironment) {
  requireCapability(env, 'testnet');
  const provider = createProvider(env);
  try {
    if (Number(BigInt(await provider.send('eth_chainId', []))) !== env.MONAD_CHAIN_ID) throw new ApiError('CHAIN_MISMATCH', 'El RPC está conectado a otra red.', 503);
    if (!runtimeMatches(await provider.getCode(env.CONTRACT_ADDRESS!))) throw new ApiError('CONTRACT_MISMATCH', 'La dirección no contiene la versión compilada de DowntimeCover. Despliega el contrato actual.', 503);
    const contract = new Contract(env.CONTRACT_ADDRESS!, abi, provider);
    const agent = new Wallet(env.AGENT_PRIVATE_KEY!, provider);
    const user = new Wallet(env.DEMO_USER_PRIVATE_KEY!, provider);
    if ((await contract.agent()).toLowerCase() !== agent.address.toLowerCase()) throw new ApiError('AGENT_MISMATCH', 'AGENT_PRIVATE_KEY no corresponde al agente del contrato.', 503);
    const [minimum, indemnity, cap] = await Promise.all([contract.stakeMinimo(), contract.indemnizacion(), contract.topePorEvento()]);
    if (minimum < indemnity * cap) throw new ApiError('BOND_NOT_GUARANTEED', 'El contrato no garantiza el bono para el tope del evento.', 503);
    return { provider, contract, agent, user };
  } catch (error) { provider.destroy(); throw chainError(error); }
}
type Context = Awaited<ReturnType<typeof createChainContext>>;
export type ChainResult = { ok: true; modo: 'testnet'; txHash: string | null; duracionMs: number; [key: string]: unknown };

function policyJson(p: { id: bigint; dueno: string; servicioId: bigint; inicio: bigint; fin: bigint; estado: bigint }): PolizaJSON {
  const states = ['Activa', 'Pagada', 'Expirada'] as const;
  if (!states[Number(p.estado)] || p.fin > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1000)))
    throw new ApiError('CONTRACT_DATA_INVALID', 'La póliza excede los límites del formato público.', 503);
  return { id: p.id.toString(), dueno: p.dueno, servicioId: Number(p.servicioId), inicio: Number(p.inicio), fin: Number(p.fin), estado: states[Number(p.estado)] };
}
export async function chainPolicies(ctx: Context): Promise<PolizaJSON[]> {
  const total = await ctx.contract.totalPolizas() as bigint;
  const policies: PolizaJSON[] = [];
  for (let offset = 1n; offset <= total; offset += 100n) {
    const page = await ctx.contract.listarPolizas(offset, 100);
    policies.push(...page.map(policyJson));
  }
  return policies;
}
async function parameters(ctx: Context): Promise<ParametrosJSON> {
  const c = ctx.contract;
  const [price, indemnity, threshold, wait, cap, hours] = await Promise.all([
    c.precioHora(), c.indemnizacion(), c.umbralSegundos(), c.tiempoReclamo(), c.topePorEvento(), c.maxHoras(),
  ]);
  return { precioHora: formatEther(price), indemnizacion: formatEther(indemnity), umbralSeg: Number(threshold),
    tiempoReclamoSeg: Number(wait), topePorEvento: Number(cap), maxHoras: Number(hours) };
}
async function confirmedResult(ctx: Context, op: ChainOperation, receipt: TransactionReceipt): Promise<ChainResult> {
  const result: ChainResult = { ok: true, modo: 'testnet', txHash: receipt.hash, duracionMs: Date.now() - op.started };
  if (op.action === 'buy') {
    const purchase = receipt.logs.filter((log) => log.address.toLowerCase() === String(ctx.contract.target).toLowerCase())
      .map((log) => { try { return iface.parseLog(log); } catch { return null; } }).find((log) => log?.name === 'CoverComprada');
    if (!purchase || purchase.args.dueno.toLowerCase() !== ctx.user.address.toLowerCase()) throw new ApiError('RECEIPT_INVALID', 'La compra se confirmó, pero su receipt requiere revisión.', 503, receipt.hash);
    result.poliza = policyJson(await ctx.contract.getPolicy(purchase.args.polizaId));
    result.prima = formatEther(purchase.args.prima); result.pagoFijo = formatEther(await ctx.contract.indemnizacion());
  }
  return result;
}
async function settle(ctx: Context, env: BackendEnvironment, op: ChainOperation, save: () => Promise<void>): Promise<ChainResult> {
  if (op.status === 'confirmed') return op.result as ChainResult;
  if (op.status === 'rejected' || op.status === 'reverted') throw new ApiError(op.error ?? 'TRANSACTION_REVERTED', messages[op.error ?? ''] ?? 'La transacción fue rechazada. No se volverá a enviar con esta clave.', 409, op.hash ?? null);
  let receipt = await ctx.provider.getTransactionReceipt(op.hash!);
  if (!receipt) {
    const signed = Transaction.from(op.raw!);
    const signer = op.actor === 'agent' ? ctx.agent : ctx.user;
    const method = { buy: 'buyCover', claim: 'claimAgentFailure', payout: 'payout', report: 'reportOutage' }[op.action];
    if (signed.hash !== op.hash || signed.from?.toLowerCase() !== signer.address.toLowerCase() ||
      signed.to?.toLowerCase() !== String(ctx.contract.target).toLowerCase() || signed.chainId !== BigInt(env.MONAD_CHAIN_ID) ||
      iface.parseTransaction({ data: signed.data })?.name !== method)
      throw new ApiError('JOURNAL_INVALID', 'El envío persistido no corresponde a esta operación. No se reenviará.', 503, op.hash!);
    // raw y hash se guardaron antes del primer envío. Rebroadcast conserva nonce y hash.
    await save();
    if (!await ctx.provider.getTransaction(op.hash!)) {
      try { await ctx.provider.broadcastTransaction(op.raw!); }
      catch { /* Puede estar minada o en el mempool; buscar siempre el mismo hash. */ }
    }
    try { receipt = await ctx.provider.waitForTransaction(op.hash!, 1, env.TX_WAIT_MS); }
    catch { throw new ApiError('TRANSACTION_PENDING', 'La transacción está enviada o pendiente de confirmar. Reintenta con la misma clave.', 503, op.hash!); }
  }
  if (!receipt) throw new ApiError('TRANSACTION_PENDING', 'La transacción sigue pendiente de confirmación.', 503, op.hash!);
  const finalityDeadline = Date.now() + env.TX_WAIT_MS;
  while (true) {
    const finalized = await ctx.provider.getBlock('finalized');
    if (finalized && finalized.number >= receipt.blockNumber) break;
    if (Date.now() >= finalityDeadline) throw new ApiError('TRANSACTION_PENDING', 'La transacción está minada y espera finalización.', 503, op.hash!);
    await delay(300);
  }
  if (receipt.status !== 1) { op.status = 'reverted'; op.error = 'TRANSACTION_REVERTED'; delete op.raw; await save();
    throw new ApiError('TRANSACTION_REVERTED', 'Monad revirtió la transacción.', 409, receipt.hash); }
  op.result = await confirmedResult(ctx, op, receipt); op.status = 'confirmed'; delete op.raw; await save();
  invalidateChainState(env);
  return op.result as ChainResult;
}
export async function executeChainTransaction(ctx: Context, env: BackendEnvironment, state: ChainStore, save: () => Promise<void>,
  key: string, action: string, input: Record<string, unknown>, actor: 'user' | 'agent', transaction: () => Promise<TransactionRequest>) {
  const fingerprint = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
  const existing = state.operations[key];
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT', 'Esta clave ya se usó con otros datos.', 409);
    return { status: action === 'buy' ? 201 as const : 200 as const, resultado: await settle(ctx, env, existing, save), replayed: true };
  }
  for (const pending of Object.values(state.operations)) if (pending.actor === actor && pending.status === 'prepared') await settle(ctx, env, pending, save);
  const signer = actor === 'agent' ? ctx.agent : ctx.user;
  const op: ChainOperation = { fingerprint, action, input, actor, started: Date.now(), status: 'prepared' };
  try {
    const request = await signer.populateTransaction(await transaction());
    // Margen para bucles de limpieza; nunca sustituir estimateGas para saltar un revert.
    request.gasLimit = (BigInt(request.gasLimit!) * 120n) / 100n;
    op.raw = await signer.signTransaction(request); op.hash = keccak256(op.raw); op.nonce = request.nonce ?? undefined;
  } catch (error) {
    const safe = chainError(error);
    if (safe.status === 409) { op.status = 'rejected'; op.error = safe.codigo; state.operations[key] = op; await save(); }
    throw safe;
  }
  state.operations[key] = op;
  await save();
  return { status: action === 'buy' ? 201 as const : 200 as const, resultado: await settle(ctx, env, op, save), replayed: false };
}
export async function usingChain<T>(env: BackendEnvironment, work: (ctx: Context, state: ChainStore, save: () => Promise<void>) => Promise<T>): Promise<T> {
  return withChainStore(env, async (state, save) => {
    const ctx = await createChainContext(env);
    try { return await work(ctx, state, save); } catch (error) { throw chainError(error); }
    finally { ctx.provider.destroy(); }
  });
}
export async function syncChainEvents(ctx: Context, env: BackendEnvironment, state: ChainStore, save: () => Promise<void>) {
  const finalized = await ctx.provider.getBlock('finalized');
  if (!finalized) throw new ApiError('RPC_UNAVAILABLE', 'No se pudo consultar el bloque finalizado.', 503);
  const latest = finalized.number;
  if (env.CONTRACT_DEPLOY_BLOCK! > latest) throw new ApiError('DEPLOY_BLOCK_INVALID', 'El bloque de despliegue está por encima de la cadena.', 503);
  const from = Math.max(env.CONTRACT_DEPLOY_BLOCK!, state.scanned - 8 + 1);
  const events = state.eventos.filter((event) => event.bloque === undefined || event.bloque < from);
  const times = new Map<number, number>();
  for (let start = from; start <= latest; start += 100) {
    const end = Math.min(start + 99, latest);
    const logs = await ctx.provider.getLogs({ address: env.CONTRACT_ADDRESS!, fromBlock: start, toBlock: end });
    for (const log of logs) {
      const parsed = iface.parseLog(log); if (!parsed) continue;
      if (!times.has(log.blockNumber)) { const block = await ctx.provider.getBlock(log.blockNumber); if (!block) throw new Error('block unavailable'); times.set(log.blockNumber, block.timestamp); }
      events.push({ id: log.transactionHash + ':' + log.index, tipo: parsed.name,
        polizaId: parsed.args.polizaId?.toString() ?? null, servicioId: parsed.args.servicioId === undefined ? undefined : Number(parsed.args.servicioId),
        txHash: log.transactionHash, timestamp: times.get(log.blockNumber)!, ok: true, motivo: null, origen: 'testnet', bloque: log.blockNumber });
    }
    state.eventos = events.slice(-2000); state.scanned = end; await save();
  }
  state.eventos = events.slice(-2000); state.scanned = latest; await save();
}
async function readChainStateUncached(env: BackendEnvironment) {
  return usingChain(env, async (ctx, state, save) => {
    await syncChainEvents(ctx, env, state, save);
    const [fondo, bono, policies, params, exposure, outage, minimum] = await Promise.all([
      ctx.contract.fundBalance(), ctx.contract.bondBalance(), chainPolicies(ctx), parameters(ctx),
      ctx.contract.exposicionTotal(), ctx.contract.getOutage(1), ctx.contract.stakeMinimo(),
    ]);
    const payable: Record<string, string> = {};
    for (const policy of policies) payable[policy.id] = policy.estado !== 'Pagada' && outage.id !== 0n &&
      BigInt(policy.inicio) <= outage.inicio && outage.inicio < BigInt(policy.fin) && outage.pagosRealizados < BigInt(params.topePorEvento) ? outage.id.toString() : '0';
    return { modo: 'testnet' as const, chainId: env.MONAD_CHAIN_ID, contrato: env.CONTRACT_ADDRESS!, cuentaDemo: ctx.user.address,
      fondo: formatEther(fondo), bono: formatEther(bono), exposicionTotal: formatEther(exposure), stakeMinimo: formatEther(minimum),
      agenteActivo: state.controls.agenteActivo, exchangeCaido: state.controls.caido, caidaIniciadaEn: state.controls.caidaDesde,
      servicios: [{ id: 1, nombre: 'Exchange Demo', tipo: 'Exchange', caido: state.controls.caido, caidaIniciadaEn: state.controls.caidaDesde }],
      parametros: params, polizas: policies, eventos: state.eventos, caidasPagables: payable,
      caida: outage.id === 0n ? null : { id: outage.id.toString(), inicio: Number(outage.inicio), reportadoEn: Number(outage.reportadoEn),
        duracionSegundos: Number(outage.duracionSegundos), pagosRealizados: Number(outage.pagosRealizados) },
      compraHabilitada: outage.id === 0n && !state.controls.caido && bono >= minimum,
      monitor: { ...state.monitor },
    };
  });
}
type Snapshot = Awaited<ReturnType<typeof readChainStateUncached>>;
type CacheEntry = { expires: number; value?: Snapshot; pending?: Promise<Snapshot> };
// Compartido entre bundles de rutas de Next, sin incluir cookies ni secretos en las respuestas.
const cacheHost = globalThis as typeof globalThis & { __safeWhaleSnapshots?: Map<string, CacheEntry> };
const snapshots = cacheHost.__safeWhaleSnapshots ??= new Map<string, CacheEntry>();
function cacheKey(env: BackendEnvironment) { return createHash('sha256').update(JSON.stringify([
  env.STATE_FILE, env.MONAD_RPC_URL, env.CONTRACT_ADDRESS, env.CONTRACT_DEPLOY_BLOCK, env.AGENT_PRIVATE_KEY, env.DEMO_USER_PRIVATE_KEY,
  env.STORAGE_BACKEND, env.STATE_NAMESPACE, env.DATABASE_URL,
])).digest('hex'); }
export function invalidateChainState(env: BackendEnvironment) { snapshots.delete(cacheKey(env)); }
export async function readChainState(env: BackendEnvironment): Promise<Snapshot> {
  const key = cacheKey(env), previous = snapshots.get(key);
  if (previous?.pending) return previous.pending;
  if (previous?.value && previous.expires > Date.now()) return previous.value;
  const entry: CacheEntry = { expires: 0 };
  entry.pending = readChainStateUncached(env).then((value) => {
    entry.value = value; entry.expires = Date.now() + 2000; delete entry.pending; return value;
  }, (error) => { snapshots.delete(key); throw error; });
  if (snapshots.size > 10) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key, entry); return entry.pending;
}
export async function buyChainCover(env: BackendEnvironment, key: string, input: { servicioId: number; horas: number }) {
  return usingChain(env, async (ctx, state, save) => executeChainTransaction(ctx, env, state, save, key, 'buy', input, 'user', async () => {
    if (input.servicioId !== 1) throw new ApiError('ServicioInvalido', messages.ServicioInvalido, 409);
    if (state.controls.caido) throw new ApiError('EXCHANGE_DOWN', 'No se puede comprar durante la caída del servicio.', 409);
    const price = await ctx.contract.precioHora();
    return ctx.contract.connect(ctx.user).getFunction('buyCover').populateTransaction(input.servicioId, input.horas, { value: price * BigInt(input.horas) });
  }));
}
export async function claimChainCover(env: BackendEnvironment, key: string, input: { polizaId: string }) {
  return usingChain(env, async (ctx, state, save) => executeChainTransaction(ctx, env, state, save, key, 'claim', input, 'user', () =>
    ctx.contract.connect(ctx.user).getFunction('claimAgentFailure').populateTransaction(input.polizaId)));
}
export async function attackChainCover(env: BackendEnvironment, key: string, input: { polizaId: string }) {
  return usingChain(env, async (ctx, state, save) => {
    const fingerprint = createHash('sha256').update(JSON.stringify({ action: 'attack', input })).digest('hex');
    const previous = state.operations[key];
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT', 'La clave ya se usó con otros datos.', 409);
      return { status: 200 as const, resultado: previous.result as ChainResult, replayed: true };
    }
    let reason = '';
    try { await ctx.contract.connect(ctx.agent).getFunction('payout').staticCall(input.polizaId); }
    catch (error) { const safe = chainError(error); if (safe.status !== 409) throw safe; reason = safe.codigo; }
    if (!reason) throw new ApiError('ATTACK_NOT_INVALID', 'Esta póliza sí puede pagarse. Elige una póliza sin caída; no se envió una transacción.', 409);
    const result: ChainResult = { ok: true, modo: 'testnet', txHash: null, duracionMs: 0, rechazado: true, motivo: reason,
      mensaje: messages[reason] ?? reason, comprobacion: 'eth_call_sin_transaccion' };
    state.operations[key] = { fingerprint, action: 'attack', input, actor: 'control', status: 'confirmed', started: Date.now(), result };
    state.eventos.push({ id: 'attack-' + key, tipo: 'Revertido', polizaId: input.polizaId, txHash: null, timestamp: Math.floor(Date.now() / 1000), ok: false, motivo: reason, origen: 'testnet' });
    await save(); invalidateChainState(env); return { status: 200 as const, resultado: result, replayed: false };
  });
}
export async function controlChain(env: BackendEnvironment, key: string, action: 'drop' | 'restore' | 'agent', input: Record<string, unknown>) {
  return withChainStore(env, async (state, save) => {
    if (input.servicioId !== undefined && input.servicioId !== 1) throw new ApiError('ServicioInvalido', messages.ServicioInvalido, 409);
    const fingerprint = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
    const previous = state.operations[key];
    if (previous) { if (previous.fingerprint !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT', 'La clave ya se usó con otros datos.', 409);
      return { status: 200 as const, resultado: previous.result as ChainResult, replayed: true }; }
    if (action === 'agent') state.controls.agenteActivo = input.activo === true;
    if (action === 'drop' && !state.controls.caido) { state.controls.caido = true; state.controls.caidaDesde = Math.floor(Date.now() / 1000); }
    if (action === 'restore') { state.controls.caido = false; state.controls.caidaDesde = null; state.monitor.observadoDesde = null; state.monitor.muestras = 0; state.monitor.inicioCaida = null; }
    const result: ChainResult = { ok: true, modo: 'testnet', txHash: null, duracionMs: 0, agenteActivo: state.controls.agenteActivo, exchangeCaido: state.controls.caido };
    state.operations[key] = { fingerprint, action, input, actor: 'control', status: 'confirmed', started: Date.now(), result };
    state.eventos.push({ id: 'control-' + key, tipo: action === 'agent' ? (state.controls.agenteActivo ? 'AgenteEncendido' : 'AgenteApagado') : action === 'drop' ? 'ServicioCaido' : 'ServicioRestaurado',
      servicioId: 1, polizaId: null, txHash: null, timestamp: Math.floor(Date.now() / 1000), ok: true, motivo: null, origen: 'simulado' });
    await save(); invalidateChainState(env); return { status: 200 as const, resultado: result, replayed: false };
  });
}
export async function stormChain(env: BackendEnvironment, key: string, input: { polizaIds: string[] }) {
  const fingerprint = createHash('sha256').update(JSON.stringify({ action: 'storm', input })).digest('hex');
  const cached = await withChainStore(env, async (state, save) => {
    const previous = state.operations[key];
    if (previous && previous.fingerprint !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT', 'Esta clave ya se usó con otros datos.', 409);
    if (previous?.status === 'confirmed') return previous.result;
    if (!previous) { state.operations[key] = { fingerprint, action: 'storm', input, actor: 'control', status: 'prepared', started: Date.now() }; await save(); }
    return null;
  });
  if (cached) return { status: 200 as const, resultado: cached, replayed: true };
  const started = Date.now(); const resultados: { polizaId: string; ok: boolean; txHash: string | null; motivo: string | null }[] = [];
  for (const polizaId of input.polizaIds) {
    try { const outcome = await usingChain(env, async (ctx, state, save) => {
      if (!state.controls.agenteActivo) throw new ApiError('AGENT_DISABLED', 'Los pagos del agente están desactivados.', 409);
      return executeChainTransaction(ctx, env, state, save, key + ':p:' + polizaId, 'payout', { polizaId }, 'agent', () => ctx.contract.connect(ctx.agent).getFunction('payout').populateTransaction(polizaId));
    }); resultados.push({ polizaId, ok: true, txHash: outcome.resultado.txHash, motivo: null }); }
    catch (error) { const safe = chainError(error); resultados.push({ polizaId, ok: false, txHash: safe.txHash, motivo: safe.codigo });
      if (safe.codigo === 'TRANSACTION_PENDING') break; }
  }
  for (const polizaId of input.polizaIds.slice(resultados.length)) resultados.push({ polizaId, ok: false, txHash: null, motivo: 'PENDIENTE_TRANSACCION_ANTERIOR' });
  const resultado = { ok: true as const, modo: 'testnet' as const, txHash: null, duracionMs: Date.now() - started, resultados };
  await withChainStore(env, async (state, save) => {
    const op = state.operations[key]; op.result = resultado;
    op.status = resultados.some((r) => r.motivo === 'TRANSACTION_PENDING' || r.motivo === 'RPC_UNAVAILABLE') ? 'prepared' : 'confirmed'; await save();
  });
  return { status: 200 as const, resultado, replayed: false };
}
export async function quoteChainCover(env: BackendEnvironment, input: { servicioId: number; horas: number }) {
  const state = await readChainState(env);
  if (input.servicioId !== 1) throw new ApiError('ServicioInvalido', messages.ServicioInvalido, 409);
  if (!state.compraHabilitada) throw new ApiError('PURCHASE_UNAVAILABLE', 'El contrato no admite nuevas compras en su estado actual.', 409);
  if (input.horas > state.parametros.maxHoras) throw new ApiError('DuracionInvalida', messages.DuracionInvalida, 409);
  return usingChain(env, async (ctx) => {
    const value = (await ctx.contract.precioHora()) * BigInt(input.horas);
    await ctx.contract.connect(ctx.user).getFunction('buyCover').staticCall(1, input.horas, { value });
    return { servicioId: 1, horas: input.horas, prima: formatEther(value), pagoFijo: state.parametros.indemnizacion, moneda: 'MON' as const, requiereConfirmacion: true as const };
  });
}
