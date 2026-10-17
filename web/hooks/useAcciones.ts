'use client';

import { useMemo } from 'react';
import { responder } from './agenteSimulado';
import { post, usaApi } from './api';
import { hex } from './formato';
import { simulador } from './simulador';
import type { Wallet } from './useWallet';
import type { MotivoRevert, Poliza, RespuestaAgente } from './tipos';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResultadoCompra = { ok: true; poliza: Poliza } | { ok: false; error: string };

/**
 * Acciones de la app. Sin API las resuelve el simulador; con NEXT_PUBLIC_API_BASE además hacen POST
 * a /api/<accion> (el estado real llega por el polling de useEstado). Con contrato configurado,
 * comprar y reclamar se firman en MetaMask.
 */
export function useAcciones(wallet: Wallet) {
  return useMemo(() => ({
    async comprar(horas: number, servicioId: number, dueno: string): Promise<ResultadoCompra> {
      let hash = hex(64);
      let id = simulador.getEstado().nextId;
      if (wallet.esReal()) {
        const r = await wallet.buyCover(servicioId, horas);
        if (!r.ok) return r;
        hash = r.hash;
        if (r.id != null) id = r.id;
      } else if (usaApi) {
        const r = await post<{ txHash?: string; polizaId?: number }>('comprar', { horas, servicioId });
        if (r?.txHash) hash = r.txHash;
        if (r?.polizaId) id = Number(r.polizaId);
      } else {
        await esperar(900);
      }
      return { ok: true, poliza: simulador.registrarCompra({ id, hash, horas, servicioId, dueno }) };
    },

    async reclamar(polizaId: number): Promise<{ ok: boolean; error?: string }> {
      if (wallet.esReal()) {
        const r = await wallet.claimAgentFailure(polizaId);
        if (!r.ok) return r;
        simulador.pagar([polizaId], 0, 'bono', r.hash);
      } else if (usaApi) {
        await post('reclamar', { polizaId });
      } else {
        await esperar(700);
        simulador.pagar([polizaId], 0, 'bono');
      }
      return { ok: true };
    },

    tumbar(servicioActual: number) {
      const r = simulador.tumbar(servicioActual);
      post('tumbar', { caido: r.caido });
      return r;
    },

    atacar(): MotivoRevert {
      post('atacar', {});
      return simulador.atacar();
    },

    apagarAgente() {
      const activo = simulador.alternarAgente();
      post('apagar-agente', { activo });
      return activo;
    },

    tormenta() {
      const st = simulador.getEstado().storm;
      if (st && !st.end) return;
      post('tormenta', {});
      simulador.tormenta();
    },

    async chat(mensaje: string, servicio: number): Promise<RespuestaAgente> {
      const s = simulador.getEstado();
      const local = () => responder(mensaje, { maxHoras: s.maxHoras, servicio, reclamoSeg: s.tiempoReclamoSeg });
      if (usaApi) {
        const r = await post<{ respuesta?: string; propuesta?: { horas?: number } }>('chat', { mensaje });
        return r && r.respuesta ? { text: r.respuesta, quote: !!r.propuesta, horas: r.propuesta?.horas || 4 } : local();
      }
      await esperar(650);
      return local();
    }
  }), [wallet]);
}
