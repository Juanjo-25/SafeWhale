'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { C } from '../colores';
import { useAcciones } from '@/hooks/useAcciones';
import { useEstado } from '@/hooks/useEstado';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { post, errorMessage, rememberDemoAccess } from '@/hooks/api';
import { explorerLink } from '@/hooks/estado-api';
import { dur, hhmm, hms, mon, num, secs, short, svcName } from '@/hooks/formato';
import type { Evento, Poliza } from '@/hooks/tipos';
import { ActividadCard } from './ActividadCard';
import { AppHeader } from './AppHeader';
import type { Caja } from './CajaEstado';
import { ChatFab } from './ChatFab';
import { ChatPanel, type Mensaje } from './ChatPanel';
import { CoberturaCard } from './CoberturaCard';
import { CompraCard } from './CompraCard';
import { DemoLab, type Aviso } from './DemoLab';
import { PoolCard } from './PoolCard';
import { TabsMovil, type TabMovil } from './TabsMovil';
import { TormentaCard } from './TormentaCard';

const BIENVENIDA: Mensaje = {
  role: 'agent',
  text: 'Hola. Puedo cotizar una cobertura de Exchange Demo por entre 1 y 24 horas. La compra requiere tu confirmación. ¿Cuántas horas necesitas?'
};

const EV_TITULO: Record<string, string> = { ServicioCaido: 'Servicio caído', ServicioRestaurado: 'Servicio restaurado', ExchangeCaido: 'Servicio caído', AgenteApagado: 'Pagos desactivados', CoverComprada: 'Cobertura comprada', CaidaReportada: 'Caída reportada', Pagado: 'Pagado', Reclamado: 'Reclamado del bono', Revertido: 'Revertido', Tormenta: 'Tormenta completada' };
const EV_DOT: Record<string, string> = { CoverComprada: C.orange, CaidaReportada: C.blue, Pagado: C.green, Reclamado: C.purple, Revertido: C.red, Tormenta: C.green };
const evT = (e: Evento) => (EV_TITULO[e.tipo] || e.tipo) + (e.ok === false && e.motivo ? ' · ' + e.motivo : '');

const gap = 'gap-[clamp(16px,2.4vw,28px)]';

export function SafeWhaleApp({ demoInicial }: { demoInicial: boolean }) {
  const { estado: s, loading, error: stateError, refresh } = useEstado();
  const reloj = useNow(250);
  const isMobile = useMediaQuery('(max-width: 759px)');

  const [mensajes, setMensajes] = useState<Mensaje[]>([BIENVENIDA]);
  const agentSay = useCallback((text: string) => setMensajes((m) => [...m, { role: 'agent', text }]), []);
  const acciones = useAcciones(refresh);
  const [accessToken, setAccessToken] = useState('');
  const [accessBusy, setAccessBusy] = useState(false);
  const [localStorm, setLocalStorm] = useState<import('@/hooks/tipos').Tormenta | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const controlRef = useRef(false);
  const typingRef = useRef(false);

  const [demo, setDemo] = useState(demoInicial);
  const [servicio, setServicio] = useState(1);
  const [horas, setHoras] = useState(4);
  const [horasInput, setHorasInput] = useState('4');
  const [coverFocus, setCoverFocus] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [tab, setTab] = useState<'pol' | 'ev'>('pol');
  const [mtab, setMtab] = useState<TabMovil>('poliza');
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(1);
  const [banner, setBanner] = useState<Aviso | null>(null);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [buying, setBuying] = useState(false);
  const [busyMsg, setBusyMsg] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const horasRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buyingRef = useRef(false);
  const claimingRef = useRef(false);
  const servicioRef = useRef(servicio);
  servicioRef.current = servicio;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length, typing, chatOpen]);

  useEffect(() => {
    if (!focusTick) return;
    const el = horasRef.current;
    if (el) { el.focus(); el.select(); }
  }, [focusTick]);

  const focusCover = () => {
    if (isMobile && mtab !== 'poliza') setMtab('poliza');
    setFocusTick((t) => t + 1);
  };

  const backendReady = () => {
    if (!s.autorizado) { setBanner({ kind: 'warn', title: 'Acceso de demo', text: 'Introduce el token del servidor para autorizar las transacciones.' }); return false; }
    if (!stateError && !loading) return true;
    setBanner({ kind: 'warn', title: 'Conexión al backend', text: stateError ?? 'Espera a que el backend termine de cargar.' });
    return false;
  };

  const buy = async (h: number, msgIndex?: number, svc = servicio) => {
    if (buyingRef.current || !backendReady() || (msgIndex != null && mensajes[msgIndex]?.done)) return;
    buyingRef.current = true; setBuying(true); setBusyMsg(msgIndex ?? null);
    try {
      const r = await acciones.comprar(h, svc);
      if (msgIndex != null) setMensajes((ms) => ms.map((m, k) => k === msgIndex ? { ...m, done: true } : m));
      setBanner(null);
      agentSay('Póliza #' + r.poliza.id + ' registrada hasta las ' + hhmm(r.poliza.fin) + '. Prima: ' + mon(s.precioHora * h) + (r.modo === 'testnet' ? '. Transacción confirmada en Monad: ' + r.txHash : '. Compra simulada, sin transacción on-chain.'));
    } catch (error) {
      const text = errorMessage(error);
      setBanner({ kind: 'err', title: 'Compra sin confirmar', text });
      agentSay('No pude confirmar la compra: ' + text);
    } finally { buyingRef.current = false; setBuying(false); setBusyMsg(null); }
  };

  const claim = async (id: number | string) => {
    if (claimingRef.current || !backendReady()) return;
    claimingRef.current = true; setClaiming(true);
    try { await acciones.reclamar(id); }
    catch (error) { agentSay('No se pudo completar el reclamo: ' + errorMessage(error)); }
    finally { claimingRef.current = false; setClaiming(false); }
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || typingRef.current || !backendReady()) return;
    typingRef.current = true; setTyping(true); setInput('');
    setMensajes((m) => [...m, { role: 'user', text }]);
    try {
      const r = await acciones.chat(text);
      const svc = r.svc ?? servicioRef.current;
      if (r.quote && r.horas) { setHoras(r.horas); setHorasInput(String(r.horas)); }
      setServicio(svc);
      setMensajes((m) => [...m, { role: 'agent', text: r.text, quote: !!r.quote, horas: r.horas, svc, prima: r.prima, pagoFijo: r.pagoFijo }]);
    } catch (error) { agentSay('Gemini no pudo responder: ' + errorMessage(error)); }
    finally { typingRef.current = false; setTyping(false); }
  };

  const control = async (action: () => Promise<unknown>, title: string) => {
    if (controlRef.current || !backendReady()) return;
    controlRef.current = true; setControlBusy(true);
    try { const result = await action() as { motivo?: string; rechazado?: boolean }; setBanner({ kind: 'warn', title, text: result?.rechazado ? 'El contrato rechazó el intento: ' + result.motivo + '. No se envió una transacción.' : 'Estado actualizado. El monitor conserva la detección y el reporte; el interruptor controla los pagos.' }); }
    catch (error) { setBanner({ kind: 'err', title: 'Acción sin confirmar', text: errorMessage(error) }); }
    finally { controlRef.current = false; setControlBusy(false); }
  };
  const tumbar = () => control(() => s.exchangeCaido ? acciones.restaurar(servicio) : acciones.tumbar(servicio), s.exchangeCaido ? 'Servicio restaurado' : 'Caída activada en el mock');
  const apagar = () => control(() => acciones.apagarAgente(!s.agenteActivo), s.agenteActivo ? 'Pagos del agente desactivados' : 'Pagos del agente habilitados');
  const storm = async () => {
    const ids = s.polizas.filter((p) => s.caidasPagables[String(p.id)] && s.caidasPagables[String(p.id)] !== '0').slice(0, 30).map((p) => p.id);
    if (!ids.length) { setBanner({ kind: 'warn', title: 'Tormenta', text: 'Primero compra pólizas y espera el reporte de una caída elegible.' }); return; }
    await control(async () => { const start = performance.now(); const result = await acciones.tormenta(ids);
      setLocalStorm({ start, end: start + result.duracionMs, paid: result.resultados.map((r) => r.ok) });
      agentSay(result.resultados.map((r) => '#' + r.polizaId + ': ' + (r.ok ? 'pago confirmado' : r.motivo)).join(' · '));
      return result;
    }, 'Tormenta finalizada');
  };
  const unlock = async () => {
    if (accessBusy) return; setAccessBusy(true);
    try { await post('demo-session', { token: accessToken }); rememberDemoAccess(accessToken); setAccessToken(''); await refresh(); setBanner(null); }
    catch (error) { setBanner({ kind: 'err', title: 'Acceso rechazado', text: errorMessage(error) }); }
    finally { setAccessBusy(false); }
  };

  // ── Derivados (misma lógica que renderVals de la referencia) ──
  const now = Math.max(reloj, Date.now());
  const pol: Poliza | undefined = s.polizas.find((p) => p.dueno.toLowerCase() === s.cuentaDemo?.toLowerCase());
  const active = !!pol && pol.estado === 0 && pol.fin > now;
  const sinceRep = s.caidaReportada ? now - s.caidaReportada : 0;
  const caidaMs = s.caidaInicio ? now - s.caidaInicio : 0;
  const R = s.tiempoReclamoSeg * 1000;
  const umbral = s.umbralSeg;
  const estadoOf = (p: Poliza) => (p.estado === 1 ? (p.via === 'bono' ? 'Pagada por bono' : 'Pagada') : p.estado === 2 || p.fin <= now ? 'Expirada' : 'Activa');

  const eligible = !!pol && !!s.caidasPagables[String(pol.id)] && s.caidasPagables[String(pol.id)] !== '0';
  const canClaim = eligible && sinceRep >= R && s.bono >= s.indemnizacion && s.autorizado && !claiming && !stateError;
  let base: Partial<Caja> & Pick<Caja, 'head' | 'glyph' | 'color' | 'text'>;
  if (!pol) base = { head: 'Sin cobertura', glyph: '+', color: C.orange, text: 'Elige las horas y confirma la compra para la cuenta de demo. ' + (s.modo === 'testnet' ? 'Se enviará una transacción a Monad Testnet.' : 'La operación será simulada.'), actionLabel: 'Cubrir ahora', action: focusCover };
  else if (pol.estado === 1) base = { head: pol.via === 'bono' ? 'Cobrado del bono' : 'Pago automático', meta: '', glyph: '✓', color: C.green, text: 'Pago registrado: ' + mon(s.indemnizacion) + (pol.via === 'bono' ? ' desde el bono del agente.' : ' desde el fondo.'), url: explorerLink(pol.hash), linkLabel: pol.hash ? 'Ver transacción' : '' };
  else if (eligible && sinceRep >= R) base = { head: 'Reclamo disponible', glyph: '!', color: C.red, text: 'El plazo de pago venció. Puedes cobrar desde el bono, incluso si la cobertura ya venció.', actionLabel: canClaim ? 'Reclamar ' + mon(s.indemnizacion) : 'Reclamo pendiente', action: canClaim ? () => claim(pol.id) : null };
  else if (eligible) base = { head: 'Caída reportada', meta: Math.max(0, Math.ceil((R - sinceRep) / 1000)) + ' s para reclamar', glyph: '↯', color: C.blue, text: s.agenteActivo ? 'El monitor puede ejecutar el pago hacia la cuenta de demo.' : 'Los pagos están desactivados. El reclamo quedará disponible al vencer la espera.' };
  else if (!active) base = { head: 'Póliza expirada', glyph: '·', color: C.gray, text: 'La cobertura llegó a su fecha de vencimiento.', actionLabel: 'Comprar otra', action: focusCover };
  else if (s.exchangeCaido && !s.caidaReportada) base = { head: svcName(s.caidaSvc) + ' sin respuesta', meta: Math.floor(caidaMs / 1000) + ' / ' + umbral + ' s', glyph: '!', color: C.orange, text: 'Caída del mock registrada. El monitor exige continuidad durante el umbral antes de reportar.', hasBar: true, barPct: Math.min(100, caidaMs / (umbral * 10)) + '%' };
  else if (s.caidaReportada && s.agenteActivo) base = { head: 'Caída reportada', meta: secs(sinceRep), glyph: '↯', color: C.blue, text: 'Ejecutando payout hacia tu cuenta.' };
  else if (s.caidaReportada && sinceRep < R) base = { head: 'El agente no pagó', meta: Math.ceil((R - sinceRep) / 1000) + ' s', glyph: '!', color: C.red, text: 'Se reportó la caída pero nadie llamó a payout. Cuando venza el plazo cobras del bono del agente.', hasBar: true, barPct: (sinceRep / R * 100) + '%' };
  else if (s.caidaReportada) base = { head: 'Plazo vencido', glyph: '!', color: C.red, text: 'El bono del agente responde por ti.', actionLabel: claiming ? 'Procesando reclamo…' : 'Reclamar ' + mon(s.indemnizacion), action: () => claim(pol.id) };
  else base = { head: 'Vigilando ' + svcName(pol.servicioId), meta: 'servicioId ' + pol.servicioId, glyph: '✓', color: C.blue, text: (s.modo === 'testnet' ? 'Cobertura on-chain activa. ' : 'Cobertura simulada activa. ') + 'Pago previsto: ' + mon(s.indemnizacion) + ', sujeto a ventana y tope del evento.', url: explorerLink(pol.buyHash), linkLabel: pol.buyHash ? 'Ver póliza on-chain' : '' };
  const caja: Caja = { meta: '', hasBar: false, barPct: '0%', url: '', linkLabel: '', actionLabel: '', action: null, ...base };

  const hoy = new Date(now).toDateString();
  const todays = s.eventos.filter((e) => new Date(e.timestamp).toDateString() === hoy);
  const activas = s.polizas.filter((p) => p.estado === 0 && p.fin > now).length;
  const expo = s.exposicionContrato ?? activas * s.indemnizacion;
  const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0);

  const alerta = !!pol && active && (s.exchangeCaido || !!s.caidaReportada);
  const agentMsgs = mensajes.filter((m) => m.role === 'agent').length;
  const unread = chatOpen ? 0 : Math.max(0, agentMsgs - seen);
  const agText = 'Gemini · cotizaciones';

  const ocultaPoliza = mtab !== 'poliza';
  const ocultaPool = mtab !== 'pool';

  return (
    <>
      <div className={`mx-auto flex max-w-[1320px] flex-col p-[clamp(14px,3vw,36px)] max-[759px]:pb-[calc(110px_+_env(safe-area-inset-bottom))] ${gap}`}>
        <AppHeader demo={demo} onToggleDemo={() => setDemo((d) => !d)} account={s.cuentaDemo} modo={s.modo} />
        <div role="status" className="rounded-[20px] bg-white px-5 py-3 text-[14px]">
          {loading ? 'Conectando con el backend…' : stateError ? 'No se pudo actualizar: ' + stateError : s.modo === 'testnet' ? 'Monad Testnet · saldos y pólizas on-chain · mock de caída local' : 'Backend conectado · compras y saldos simulados'}
          {stateError && <button type="button" className="ml-3 underline" onClick={() => void refresh()}>Reintentar</button>}
        </div>
        {s.modo === 'testnet' && !s.autorizado && <form onSubmit={(event) => { event.preventDefault(); void unlock(); }} className="flex flex-wrap items-end gap-3 rounded-[20px] bg-white p-5">
          <label className="flex flex-1 flex-col gap-2 text-[14px]">Token de acceso de demo
            <input type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} className="rounded border border-line p-3" />
          </label>
          <button type="submit" disabled={accessBusy || !accessToken} className="rounded bg-brand px-5 py-3 text-white disabled:opacity-40">{accessBusy ? 'Autorizando…' : 'Habilitar transacciones'}</button>
        </form>}
        {s.monitor?.error && <div role="alert" className="rounded-[20px] bg-white p-5 text-[14px]">Monitor: {s.monitor.error}. Revisa el proceso pnpm monitor.</div>}
        {banner && <div role="alert" className="rounded-[20px] border border-line bg-white px-5 py-4"><strong>{banner.title}</strong><p className="mb-0">{banner.text}</p></div>}

        {demo && (
          <DemoLab
            exchangeCaido={s.exchangeCaido}
            servicioCaido={svcName(s.caidaSvc)}
            agenteActivo={s.agenteActivo}
            agText={s.agenteActivo ? 'Pagos habilitados' : 'Pagos desactivados'}
            banner={null}
            disabled={controlBusy || !!stateError || loading || !s.autorizado}
            onTumbar={tumbar}
            onAtacar={() => { if (pol) void control(() => acciones.atacar(pol.id), 'Intento inválido verificado'); }}
            onTormenta={() => void storm()}
            onApagar={apagar}
          />
        )}

        {s.modo !== null && <div className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-stretch ${gap}`}>
          <CoberturaCard
            oculta={ocultaPoliza}
            titulo={pol ? 'Póliza #' + pol.id + ' · ' + svcName(pol.servicioId) + ' · ' + estadoOf(pol) : 'Cobertura'}
            valor={pol && pol.estado === 1 ? num(s.indemnizacion) : pol && active ? dur(pol.fin - now) : num(s.indemnizacion)}
            unidad={pol && active ? '' : 'MON'}
            sub={pol && pol.estado === 1 ? 'pagados a tu cuenta' : pol && active ? 'cubre ' + mon(s.indemnizacion) : 'por caída, desde ' + mon(s.precioHora) + '/h'}
            progreso={pol && (active || pol.estado === 1) ? {
              pct: pol.estado === 1 ? '100%' : Math.min(100, (now - pol.inicio) / (pol.fin - pol.inicio) * 100).toFixed(2) + '%',
              color: pol.estado === 1 ? C.green : C.orange
            } : null}
            caja={caja}
            recientes={todays.slice(0, 4).map((e) => ({ titulo: evT(e), hora: hhmm(e.timestamp), url: explorerLink(e.txHash) }))}
            recientesLabel={todays.length === 1 ? '1 evento hoy' : todays.length + ' eventos hoy'}
            mostrarRecientes={showRecent}
            onToggleRecientes={() => setShowRecent((x) => !x)}
            onCubrir={focusCover}
            puedeReclamar={canClaim}
            onReclamar={() => { if (canClaim && pol) claim(pol.id); }}
            explorerUrl={explorerLink(s.eventos[0]?.txHash)}
          />

          <div className={`flex min-w-0 flex-col ${gap} ${mtab === 'act' ? 'max-[759px]:hidden' : ''}`}>
            <CompraCard
              oculta={ocultaPoliza}
              servicio={servicio}
              onServicio={setServicio}
              horasRef={horasRef}
              horasInput={horasInput}
              maxHoras={s.maxHoras}
              onHoras={(v) => { const n = parseInt(v, 10); setHorasInput(v); if (!isNaN(n)) setHoras(Math.min(s.maxHoras, Math.max(1, n))); }}
              enfocado={coverFocus}
              onFoco={(f) => { setCoverFocus(f); if (!f) setHorasInput(String(horas)); }}
              primaLabel={mon(s.precioHora * horas)}
              indemLabel={mon(s.indemnizacion)}
              comprando={buying}
              disabled={loading || !!stateError || !s.compraHabilitada || !s.autorizado}
              onComprar={() => buy(horas, undefined, servicio)}
              comprarLabel={buying ? 'Confirmando compra…' : !s.compraHabilitada ? 'Contrato no admite compras' : (s.modo === 'testnet' ? 'Comprar en testnet · ' : 'Comprar simulación · ') + mon(s.precioHora * horas)}
            />
            <PoolCard
              oculta={ocultaPool}
              filas={[
                { glyph: 'F', label: 'Fondo disponible', value: mon(s.fondo), sub: 'Respalda los pagos', pct: pct(s.fondo, Math.max(s.fondoInicial, s.fondo)), color: C.blue },
                { glyph: 'B', label: 'Bono del agente', value: mon(s.bono), sub: 'Garantía si el agente falla', pct: pct(s.bono, s.bonoInicial), color: C.green },
                { glyph: 'E', label: 'Exposición', value: mon(expo), sub: activas + ' activas · tope ' + s.topePorEvento + ' por evento', pct: pct(expo, s.fondo), color: C.purple }
              ]}
            />
            {(localStorm ?? s.storm) && <TormentaCard storm={(localStorm ?? s.storm)!} oculta={ocultaPool} />}
          </div>

          <div className={`col-span-full flex min-w-0 flex-col ${gap} ${mtab !== 'act' ? 'max-[759px]:hidden' : ''}`}>
            <ActividadCard
              oculta={mtab !== 'act'}
              tab={tab}
              onTab={setTab}
              polizas={s.polizas.map((p) => {
                const e = estadoOf(p);
                return {
                  id: p.id,
                  horas: (p.horas ?? Math.round((p.fin - p.inicio) / 3600e3)) + ' h · ' + svcName(p.servicioId),
                  estadoLabel: e,
                  rango: hhmm(p.inicio) + ' → ' + hhmm(p.fin),
                  color: p.estado === 1 ? C.green : e === 'Expirada' ? C.gray : C.orange,
                  amount: p.estado === 1 ? '+ ' + mon(s.indemnizacion) : '- ' + mon(s.precioHora * (p.horas ?? (p.fin - p.inicio) / 3600e3)),
                  amountColor: p.estado === 1 ? 'oklch(0.5 0.14 150)' : C.ink2
                };
              })}
              eventos={s.eventos.slice(0, 15).map((e) => ({
                titulo: evT(e),
                titleColor: e.ok === false ? 'oklch(0.52 0.19 25)' : C.ink,
                detalle: e.detalle || '',
                hora: hms(e.timestamp),
                dot: e.ok === false ? C.red : EV_DOT[e.tipo] || C.gray,
                url: explorerLink(e.txHash),
                hashShort: e.txHash ? short(e.txHash) : 'Simulado · sin transacción'
              }))}
            />
          </div>
        </div>}

        <p className="m-0 text-pretty text-center text-[13px] text-[#4a4a4a]">{s.modo === 'testnet' ? 'Compras, reportes y pagos en Monad Testnet. La caída del servicio se provoca en un mock local; MON de prueba sin valor real.' : 'Demo simulada con estado persistido y monitor local.'} Primas no actuariales.</p>
      </div>

      <ChatPanel
        abierto={chatOpen}
        agenteActivo={!loading && !stateError}
        agText={agText}
        mensajes={mensajes}
        escribiendo={typing}
        scrollRef={scrollRef}
        servicio={servicio}
        comprando={buying}
        disabled={loading || !!stateError}
        mensajeOcupado={busyMsg}
        input={input}
        onInput={setInput}
        onEnviar={sendText}
        onCerrar={() => { setChatOpen(false); setSeen(agentMsgs); }}
        onConfirmar={(i) => buy(mensajes[i].horas || 1, i, mensajes[i].svc)}
      />
      <ChatFab abierto={chatOpen} noLeidos={unread} onClick={() => { setChatOpen((o) => !o); setSeen(agentMsgs); }} />
      <TabsMovil actual={mtab} alerta={alerta} onCambiar={setMtab} />
    </>
  );
}
