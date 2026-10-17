// Store del estado de SafeWhale. Sin API replica la lógica de la referencia de diseño
// (tick de 250 ms, reporte al pasar el umbral, payout, tormenta, ataque y bono).
// Con NEXT_PUBLIC_API_BASE consulta GET /api/estado cada 2 s y lo usa como fuente de verdad.

import { apiUrl, usaApi } from './api';
import { hex, mon, secs, short, svcName } from './formato';
import type { Estado, Evento, MotivoRevert, Parametros, Poliza } from './tipos';

export const PARAMETROS: Parametros = {
  precioHora: 0.01,
  indemnizacion: 0.5,
  umbralSeg: 10,
  tiempoReclamoSeg: 15,
  topePorEvento: 30,
  maxHoras: 24
};

export const ESTADO_INICIAL: Estado = {
  ...PARAMETROS,
  fondo: 25,
  fondoInicial: 25,
  bono: 2,
  bonoInicial: 2,
  agenteActivo: true,
  exchangeCaido: false,
  polizas: [],
  eventos: [],
  caidaSvc: 5,
  caidaInicio: null,
  caidaReportada: null,
  caidaId: 0,
  storm: null,
  nextId: 1
};

type Cambio = Partial<Estado> | ((s: Estado) => Partial<Estado>);

const activa = (p: Poliza, now: number) => p.estado === 0 && p.fin > now;

interface EstadoApi {
  fondo?: number | string;
  bono?: number | string;
  agenteActivo?: boolean;
  exchangeCaido?: boolean;
  polizas?: { id: number | string; dueno: string; servicioId?: number | string; inicio: number | string; fin: number | string; estado: number | string }[];
  eventos?: (Omit<Evento, 'timestamp'> & { timestamp: number | string })[];
}

class Simulador {
  private estado: Estado = ESTADO_INICIAL;
  private oyentes = new Set<() => void>();
  private tickT: ReturnType<typeof setInterval> | null = null;
  private pollT: ReturnType<typeof setInterval> | null = null;

  getEstado = () => this.estado;
  getServidor = () => ESTADO_INICIAL;

  suscribir = (fn: () => void) => {
    this.oyentes.add(fn);
    if (this.oyentes.size === 1) this.iniciar();
    return () => {
      this.oyentes.delete(fn);
      if (this.oyentes.size === 0) this.detener();
    };
  };

  private set(cambio: Cambio) {
    const p = typeof cambio === 'function' ? cambio(this.estado) : cambio;
    this.estado = { ...this.estado, ...p };
    this.oyentes.forEach((f) => f());
  }

  private iniciar() {
    this.tickT = setInterval(() => {
      try { this.tick(); } catch (e) { console.error(e); }
    }, 250);
    if (usaApi) {
      this.poll();
      this.pollT = setInterval(() => this.poll(), 2000);
    }
  }

  private detener() {
    if (this.tickT) clearInterval(this.tickT);
    if (this.pollT) clearInterval(this.pollT);
    this.tickT = this.pollT = null;
  }

  private tick() {
    const now = Date.now();
    const s = this.estado;
    if (!usaApi && s.exchangeCaido && !s.caidaReportada && s.caidaInicio && now - s.caidaInicio >= s.umbralSeg * 1000) this.reportar(now);
  }

  private async poll() {
    try {
      const d: EstadoApi = await (await fetch(apiUrl('estado'))).json();
      const n = (v: unknown) => { const x = Number(v); return x > 1e9 ? x / 1e18 : x; };
      const eventos: Evento[] = (d.eventos || [])
        .map((e) => ({ ...e, timestamp: Number(e.timestamp) < 1e12 ? Number(e.timestamp) * 1000 : Number(e.timestamp) }))
        .reverse();
      this.set((s) => {
        const rep = eventos.find((e) => e.tipo === 'CaidaReportada');
        const caidaReportada = s.caidaReportada ?? (rep && d.exchangeCaido && (!s.caidaInicio || rep.timestamp >= s.caidaInicio) ? rep.timestamp : null);
        return {
          fondo: n(d.fondo),
          bono: n(d.bono),
          agenteActivo: !!d.agenteActivo,
          exchangeCaido: !!d.exchangeCaido,
          polizas: (d.polizas || [])
            .map((p) => ({ id: Number(p.id), dueno: p.dueno, servicioId: Number(p.servicioId ?? 5), inicio: Number(p.inicio) * 1000, fin: Number(p.fin) * 1000, estado: Number(p.estado) }))
            .reverse(),
          eventos,
          caidaReportada
        };
      });
    } catch {
      // El back puede no estar arriba todavía: se reintenta en el siguiente ciclo.
    }
  }

  private ev(tipo: string, extra?: Partial<Evento>): Evento {
    return { tipo, txHash: hex(64), timestamp: Date.now(), ok: true, ...extra };
  }

  private pushEv(list: Evento[]) {
    this.set((s) => ({ eventos: [...list, ...s.eventos].slice(0, 40) }));
  }

  reportar(now: number) {
    const s = this.estado;
    const caidaId = s.caidaId + 1;
    const activas = s.polizas.filter((p) => activa(p, now) && Number(p.servicioId) === Number(s.caidaSvc));
    this.set({ caidaReportada: now, caidaId });
    this.pushEv([this.ev('CaidaReportada', { detalle: 'Caída #' + caidaId + ' de ' + s.umbralSeg + ' s en ' + svcName(s.caidaSvc) + ' · 3/3 monitores · evidencia ' + short(hex(40)) })]);
    if (s.agenteActivo && activas.length) {
      const t0 = performance.now();
      setTimeout(() => this.pagar(activas.map((p) => p.id), performance.now() - t0, 'agente'), 380 + Math.random() * 420);
    }
  }

  pagar(ids: number[], ms: number, via: 'agente' | 'bono', hash?: string) {
    hash = hash || hex(64);
    const n = ids.length;
    const ind = this.estado.indemnizacion;
    this.set((s) => ({
      polizas: s.polizas.map((p) => (ids.includes(p.id) ? { ...p, estado: 1, via, hash, pagoMs: ms } : p)),
      fondo: via === 'agente' ? s.fondo - ind * n : s.fondo,
      bono: via === 'bono' ? s.bono - ind * n : s.bono
    }));
    this.pushEv(ids.map((id) => this.ev(via === 'bono' ? 'Reclamado' : 'Pagado', {
      polizaId: id,
      txHash: hash,
      detalle: 'Póliza #' + id + ' · ' + mon(ind) + (via === 'bono' ? ' desde el bono del agente' : ' al dueño en ' + secs(ms))
    })));
  }

  registrarCompra({ id, hash, horas, servicioId, dueno }: { id: number; hash: string; horas: number; servicioId: number; dueno: string }): Poliza {
    const now = Date.now();
    const pol: Poliza = { id, dueno, servicioId, inicio: now, fin: now + horas * 3600e3, estado: 0, horas, buyHash: hash };
    this.set((s) => ({ nextId: Math.max(s.nextId, id) + 1, polizas: [pol, ...s.polizas], fondo: s.fondo + s.precioHora * horas, caidaReportada: null }));
    this.pushEv([this.ev('CoverComprada', { polizaId: id, txHash: hash, detalle: 'Póliza #' + id + ' · ' + svcName(servicioId) + ' · ' + horas + ' h · prima ' + mon(this.estado.precioHora * horas) })]);
    return pol;
  }

  /** Alterna la caída. Devuelve si quedó caído y si había pólizas activas a quién pagar. */
  tumbar(servicioActual: number) {
    const s = this.estado;
    const caer = !s.exchangeCaido;
    if (!caer) {
      this.set({ exchangeCaido: false, caidaInicio: null });
      return { caido: false, hayActivas: false };
    }
    const now = Date.now();
    const p0 = s.polizas.find((p) => activa(p, now));
    this.set({ exchangeCaido: true, caidaSvc: p0 ? p0.servicioId : servicioActual, caidaInicio: now, caidaReportada: null });
    return { caido: true, hayActivas: !!p0 };
  }

  /** El agente intenta un payout inválido; el contrato lo revierte. */
  atacar(): MotivoRevert {
    const p = this.estado.polizas[0];
    const motivo: MotivoRevert = !p ? 'PolizaInvalida' : p.estado === 1 ? 'YaPagada' : 'SinCaida';
    this.pushEv([this.ev('Revertido', { ok: false, motivo, polizaId: p?.id, detalle: 'payout(' + (p ? p.id : 999) + ') desde el agente → revert ' + motivo })]);
    return motivo;
  }

  alternarAgente() {
    const on = !this.estado.agenteActivo;
    this.set({ agenteActivo: on });
    return on;
  }

  tormenta() {
    const st = this.estado.storm;
    if (st && !st.end) return false;
    const delays = Array.from({ length: 30 }, () => 120 + Math.random() * 780);
    const last = delays.indexOf(Math.max(...delays));
    this.set({ storm: { start: performance.now(), paid: Array(30).fill(false), end: null } });
    delays.forEach((d, i) => setTimeout(() => {
      this.set((s) => {
        if (!s.storm) return {};
        const paid = s.storm.paid.slice();
        paid[i] = true;
        return { storm: { ...s.storm, paid, end: paid.every(Boolean) ? performance.now() : null } };
      });
      if (i === last) {
        this.set((s) => ({ fondo: s.fondo - s.indemnizacion * 30 }));
        this.pushEv([this.ev('Tormenta', { detalle: '30 payouts en paralelo · ' + mon(this.estado.indemnizacion * 30) + ' en ' + secs(d) })]);
      }
    }, d));
    return true;
  }

  setParametros(p: Partial<Estado>) {
    this.set(p);
  }
}

export const simulador = new Simulador();
