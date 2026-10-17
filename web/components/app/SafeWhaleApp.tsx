'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { C } from '../colores';
import { useAcciones } from '@/hooks/useAcciones';
import { useEstado } from '@/hooks/useEstado';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useWallet } from '@/hooks/useWallet';
import { EXPLORER, dur, hhmm, hms, mon, num, secs, short, svcName } from '@/hooks/formato';
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
  text: 'Hola. Te cubro por horas: si la pasarela, la nube o la plataforma de la que depende tu negocio se cae mientras estás cubierto, el contrato te paga solo. ¿Qué servicio usas y cuántas horas quieres?'
};

const EV_TITULO: Record<string, string> = { CoverComprada: 'Cobertura comprada', CaidaReportada: 'Caída reportada', Pagado: 'Pagado', Reclamado: 'Reclamado del bono', Revertido: 'Revertido', Tormenta: 'Tormenta completada' };
const EV_DOT: Record<string, string> = { CoverComprada: C.orange, CaidaReportada: C.blue, Pagado: C.green, Reclamado: C.purple, Revertido: C.red, Tormenta: C.green };
const evT = (e: Evento) => (EV_TITULO[e.tipo] || e.tipo) + (e.ok === false && e.motivo ? ' · ' + e.motivo : '');

const MOTIVO_TEXTO = { PolizaInvalida: 'la póliza no existe.', YaPagada: 'esa póliza ya se pagó una vez.', SinCaida: 'no hay una caída reportada que cubra esta póliza.' };

const gap = 'gap-[clamp(16px,2.4vw,28px)]';

export function SafeWhaleApp({ demoInicial }: { demoInicial: boolean }) {
  const s = useEstado();
  const reloj = useNow(250);
  const isMobile = useMediaQuery('(max-width: 759px)');

  const [mensajes, setMensajes] = useState<Mensaje[]>([BIENVENIDA]);
  const agentSay = useCallback((text: string) => setMensajes((m) => [...m, { role: 'agent', text }]), []);
  const wallet = useWallet(agentSay);
  const acciones = useAcciones(wallet);

  const [demo, setDemo] = useState(demoInicial);
  const [servicio, setServicio] = useState(5);
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

  const buy = async (h: number, msgIndex?: number, svc = servicio) => {
    if (buyingRef.current) return;
    h = Math.min(s.maxHoras, Math.max(1, Math.floor(h) || 1));
    const acc = wallet.account ?? (await wallet.connect());
    if (!acc) return;
    buyingRef.current = true;
    setBuying(true);
    setBusyMsg(msgIndex ?? null);
    const r = await acciones.comprar(h, svc, acc);
    buyingRef.current = false;
    setBuying(false);
    setBusyMsg(null);
    if (!r.ok) { agentSay('La compra se revirtió: ' + r.error + '. No se cobró nada.'); return; }
    if (msgIndex != null) setMensajes((ms) => ms.map((m, k) => (k === msgIndex ? { ...m, done: true } : m)));
    agentSay('Listo. Póliza #' + r.poliza.id + ' activa hasta las ' + hhmm(r.poliza.fin) + '. Si ' + svcName(svc) + ' se cae más de ' + s.umbralSeg + ' s, te llegan ' + mon(s.indemnizacion) + '.');
  };

  const claim = async (id: number) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    setClaiming(true);
    const r = await acciones.reclamar(id);
    if (!r.ok) agentSay('El reclamo se revirtió: ' + r.error + '.');
    claimingRef.current = false;
    setClaiming(false);
  };

  const sendText = async (raw: string) => {
    const text = (raw || '').trim();
    if (!text) return;
    setMensajes((m) => [...m, { role: 'user', text }]);
    setInput('');
    setTyping(true);
    const r = await acciones.chat(text, servicioRef.current);
    const svc = r.svc || servicioRef.current;
    setTyping(false);
    if (r.quote && r.horas) { setHoras(r.horas); setHorasInput(String(r.horas)); }
    setServicio(svc);
    setMensajes((m) => [...m, { role: 'agent', text: r.text, quote: !!r.quote, horas: r.horas, svc }]);
  };

  const tumbar = () => {
    const r = acciones.tumbar(servicio);
    setBanner(!r.caido || r.hayActivas ? null : { kind: 'warn', title: 'Sin pólizas activas', text: 'La caída se reporta igual, pero no hay a quién pagar. Compra una cobertura primero.' });
  };
  const atacar = () => {
    const motivo = acciones.atacar();
    setBanner({ kind: 'err', title: 'revert ' + motivo + '()', text: 'El agente intentó cobrar sin cumplir las reglas y el contrato lo bloqueó: ' + MOTIVO_TEXTO[motivo] });
  };
  const apagar = () => {
    const on = acciones.apagarAgente();
    setBanner(on ? null : { kind: 'warn', title: 'Agente apagado', text: 'El monitor reporta la caída pero nadie llama a payout. Tumba el servicio y reclama del bono cuando venza el plazo.' });
  };

  // ── Derivados (misma lógica que renderVals de la referencia) ──
  const now = Math.max(reloj, Date.now());
  const pol: Poliza | undefined = s.polizas[0];
  const active = !!pol && pol.estado === 0 && pol.fin > now;
  const sinceRep = s.caidaReportada ? now - s.caidaReportada : 0;
  const caidaMs = s.caidaInicio ? now - s.caidaInicio : 0;
  const R = s.tiempoReclamoSeg * 1000;
  const umbral = s.umbralSeg;
  const estadoOf = (p: Poliza) => (p.estado === 1 ? (p.via === 'bono' ? 'Pagada por bono' : 'Pagada') : p.estado === 2 || p.fin <= now ? 'Expirada' : 'Activa');

  let base: Partial<Caja> & Pick<Caja, 'head' | 'glyph' | 'color' | 'text'>;
  if (!pol) base = { head: 'Sin cobertura', glyph: '+', color: C.orange, text: 'Elige cuántas horas cubrir. Pagas la prima con MetaMask y el contrato guarda la póliza.', actionLabel: 'Cubrir ahora', action: focusCover };
  else if (pol.estado === 1) base = { head: pol.via === 'bono' ? 'Cobrado del bono' : 'Pago automático', meta: pol.via === 'bono' ? '' : secs(pol.pagoMs || 0), glyph: '✓', color: C.green, text: 'Recibiste ' + mon(s.indemnizacion) + (pol.via === 'bono' ? ' desde el bono del agente.' : ' en ' + secs(pol.pagoMs || 0) + ' después del reporte.'), url: EXPLORER + pol.hash, linkLabel: 'Ver transacción' };
  else if (!active) base = { head: 'Póliza expirada', glyph: '·', color: C.gray, text: 'No hubo caídas durante tu cobertura.', actionLabel: 'Comprar otra', action: focusCover };
  else if (s.exchangeCaido && !s.caidaReportada) base = { head: svcName(s.caidaSvc) + ' sin respuesta', meta: Math.floor(caidaMs / 1000) + ' / ' + umbral + ' s', glyph: '!', color: C.orange, text: 'Se reporta al contrato cuando pase el umbral de ' + umbral + ' s.', hasBar: true, barPct: Math.min(100, caidaMs / (umbral * 10)) + '%' };
  else if (s.caidaReportada && s.agenteActivo) base = { head: 'Caída reportada', meta: secs(sinceRep), glyph: '↯', color: C.blue, text: 'Ejecutando payout hacia tu cuenta.' };
  else if (s.caidaReportada && sinceRep < R) base = { head: 'El agente no pagó', meta: Math.ceil((R - sinceRep) / 1000) + ' s', glyph: '!', color: C.red, text: 'Se reportó la caída pero nadie llamó a payout. Cuando venza el plazo cobras del bono del agente.', hasBar: true, barPct: (sinceRep / R * 100) + '%' };
  else if (s.caidaReportada) base = { head: 'Plazo vencido', glyph: '!', color: C.red, text: 'El bono del agente responde por ti.', actionLabel: claiming ? 'Confirma en MetaMask…' : 'Reclamar ' + mon(s.indemnizacion), action: () => claim(pol.id) };
  else base = { head: 'Vigilando ' + svcName(pol.servicioId), meta: 'servicioId ' + pol.servicioId, glyph: '✓', color: C.blue, text: 'Todo opera normal. Si se cae más de ' + umbral + ' s, te pago ' + mon(s.indemnizacion) + ' automáticamente.', url: EXPLORER + pol.buyHash, linkLabel: 'Ver póliza on-chain' };
  const caja: Caja = { meta: '', hasBar: false, barPct: '0%', url: '', linkLabel: '', actionLabel: '', action: null, ...base };
  const canClaim = active && !!s.caidaReportada && !s.agenteActivo && sinceRep >= R;

  const hoy = new Date(now).toDateString();
  const todays = s.eventos.filter((e) => new Date(e.timestamp).toDateString() === hoy);
  const activas = s.polizas.filter((p) => p.estado === 0 && p.fin > now).length;
  const expo = activas * s.indemnizacion;
  const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0);

  const alerta = !!pol && active && (s.exchangeCaido || !!s.caidaReportada);
  const agentMsgs = mensajes.filter((m) => m.role === 'agent').length;
  const unread = chatOpen ? 0 : Math.max(0, agentMsgs - seen);
  const agText = s.agenteActivo ? 'En línea · vigilando ' + svcName(pol && active ? pol.servicioId : servicio) : 'Apagado · tus fondos siguen en el contrato';

  const ocultaPoliza = mtab !== 'poliza';
  const ocultaPool = mtab !== 'pool';

  return (
    <>
      <div className={`mx-auto flex max-w-[1320px] flex-col p-[clamp(14px,3vw,36px)] max-[759px]:pb-[calc(110px_+_env(safe-area-inset-bottom))] ${gap}`}>
        <AppHeader demo={demo} onToggleDemo={() => setDemo((d) => !d)} account={wallet.account} onConnect={() => { wallet.connect(); }} />

        {demo && (
          <DemoLab
            exchangeCaido={s.exchangeCaido}
            servicioCaido={svcName(s.caidaSvc)}
            agenteActivo={s.agenteActivo}
            agText={agText}
            banner={banner}
            onTumbar={tumbar}
            onAtacar={atacar}
            onTormenta={() => acciones.tormenta()}
            onApagar={apagar}
          />
        )}

        <div className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-stretch ${gap}`}>
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
            recientes={todays.slice(0, 4).map((e) => ({ titulo: evT(e), hora: hhmm(e.timestamp), url: EXPLORER + e.txHash }))}
            recientesLabel={todays.length === 1 ? '1 evento hoy' : todays.length + ' eventos hoy'}
            mostrarRecientes={showRecent}
            onToggleRecientes={() => setShowRecent((x) => !x)}
            onCubrir={focusCover}
            puedeReclamar={canClaim}
            onReclamar={() => { if (canClaim && pol) claim(pol.id); }}
            explorerUrl={s.eventos[0] ? EXPLORER + s.eventos[0].txHash : 'https://testnet.monadvision.com'}
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
              onComprar={() => buy(horas, undefined, servicio)}
              comprarLabel={buying ? 'Confirma en MetaMask…' : wallet.account ? 'Pagar ' + mon(s.precioHora * horas) : 'Conectar y cubrir ' + svcName(servicio) + ' ' + horas + ' h'}
            />
            <PoolCard
              oculta={ocultaPool}
              filas={[
                { glyph: 'F', label: 'Fondo disponible', value: mon(s.fondo), sub: 'Respalda los pagos', pct: pct(s.fondo, Math.max(s.fondoInicial, s.fondo)), color: C.blue },
                { glyph: 'B', label: 'Bono del agente', value: mon(s.bono), sub: 'Garantía si el agente falla', pct: pct(s.bono, s.bonoInicial), color: C.green },
                { glyph: 'E', label: 'Exposición', value: mon(expo), sub: activas + ' activas · tope ' + s.topePorEvento + ' por evento', pct: pct(expo, s.fondo), color: C.purple }
              ]}
            />
            {s.storm && <TormentaCard storm={s.storm} oculta={ocultaPool} />}
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
                  amount: p.estado === 1 ? '+ ' + mon(s.indemnizacion) : '- ' + mon(s.precioHora * (p.horas || 1)),
                  amountColor: p.estado === 1 ? 'oklch(0.5 0.14 150)' : C.ink2
                };
              })}
              eventos={s.eventos.slice(0, 15).map((e) => ({
                titulo: evT(e),
                titleColor: e.ok === false ? 'oklch(0.52 0.19 25)' : C.ink,
                detalle: e.detalle || '',
                hora: hms(e.timestamp),
                dot: e.ok === false ? C.red : EV_DOT[e.tipo] || C.gray,
                url: EXPLORER + e.txHash,
                hashShort: short(e.txHash)
              }))}
            />
          </div>
        </div>

        <p className="m-0 text-pretty text-center text-[13px] text-[#4a4a4a]">Prototipo en Monad Testnet. Caídas simuladas, primas no actuariales, no es un producto regulado.</p>
      </div>

      <ChatPanel
        abierto={chatOpen}
        agenteActivo={s.agenteActivo}
        agText={agText}
        mensajes={mensajes}
        escribiendo={typing}
        scrollRef={scrollRef}
        servicio={servicio}
        precioHora={s.precioHora}
        comprando={buying}
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
