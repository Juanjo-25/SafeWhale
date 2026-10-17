'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { ABI } from './abi';
import { fromChain, hex } from './formato';
import { simulador } from './simulador';
import { MONAD_TESTNET } from '../../shared/config';
import { idPolizaComprada, leerParametrosContrato } from './contrato';

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window { ethereum?: Eip1193 }
}

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '').trim();

export type ResultadoTx = { ok: true; hash: string; id?: string } | { ok: false; error: string };

type ErrorEthers = {
  data?: string;
  info?: { error?: { data?: string } };
  error?: { data?: string };
  revert?: { name?: string };
  shortMessage?: string;
  message?: string;
  code?: number;
};

/** Nombre del custom error del contrato o el mensaje de ethers. */
function errName(e: unknown, c?: Contract) {
  const err = e as ErrorEthers;
  if (err?.revert?.name) return err.revert.name;
  try {
    const data = err.data || err.info?.error?.data || err.error?.data;
    const p = data && c ? c.interface.parseError(data) : null;
    if (p) return p.name;
  } catch { /* no es un custom error */ }
  return err?.shortMessage || err?.message || 'Error';
}

/** MetaMask + Monad Testnet. Sin MetaMask usa una wallet de demo. */
export function useWallet(avisar: (texto: string) => void) {
  const [account, setAccount] = useState<string | null>(null);
  const accountRef = useRef<string | null>(null);

  const esReal = useCallback(() => !!CONTRACT_ADDRESS && typeof window !== 'undefined' && !!window.ethereum, []);

  const contrato = useCallback(async (firmado: boolean) => {
    const p = new BrowserProvider(window.ethereum!);
    return new Contract(CONTRACT_ADDRESS, ABI, firmado ? await p.getSigner() : p);
  }, []);

  const cargarParametros = useCallback(async () => {
    try {
      const c = await contrato(false);
      const p = await leerParametrosContrato(c);
      simulador.setParametros({
        precioHora: fromChain(p.precioHora), indemnizacion: fromChain(p.indemnizacion),
        bono: fromChain(p.bono), bonoInicial: Math.max(fromChain(p.stakeMinimo), fromChain(p.bono)),
        fondo: fromChain(p.fondo), fondoInicial: fromChain(p.fondo),
        topePorEvento: Number(p.topePorEvento), maxHoras: Number(p.maxHoras),
        umbralSeg: Number(p.umbralSegundos), tiempoReclamoSeg: Number(p.tiempoReclamo),
      });
    } catch {
      avisar('No se pudieron cargar los parámetros del contrato. Revisa la red y la dirección configurada.');
    }
  }, [contrato, avisar]);

  const fijar = (acc: string) => { accountRef.current = acc; setAccount(acc); };

  /** Conecta y devuelve la cuenta (o null si el usuario cancela). */
  const connect = useCallback(async (): Promise<string | null> => {
    if (accountRef.current) return accountRef.current;
    if (!window.ethereum) {
      const demo = '0xDe30' + hex(36).slice(2);
      fijar(demo);
      avisar('No encontré MetaMask en este navegador. Sigo con una wallet de demo.');
      return demo;
    }
    try {
      const [acc] = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_TESTNET.chainId }] });
      } catch (e) {
        if ((e as ErrorEthers).code !== 4902) throw e;
        const { id: _id, ...walletNetwork } = MONAD_TESTNET;
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [walletNetwork] });
      }
      fijar(acc);
      if (esReal()) await cargarParametros();
      return acc;
    } catch (e) {
      avisar('No se conectó la wallet: ' + ((e as ErrorEthers)?.message || e));
      return null;
    }
  }, [avisar, esReal, cargarParametros]);

  /** buyCover(servicioId, horas) con value = precioHora * horas. Devuelve hash e id de la póliza. */
  const buyCover = useCallback(async (servicioId: number, horas: number): Promise<ResultadoTx> => {
    let c: Contract | undefined;
    try {
      c = await contrato(true);
      const value = (await c.precioHora()) * BigInt(horas);
      const tx = await c.buyCover(servicioId, horas, { value });
      const rc = await tx.wait();
      return { ok: true, hash: tx.hash, id: idPolizaComprada(rc.logs, CONTRACT_ADDRESS) };
    } catch (e) {
      return { ok: false, error: errName(e, c) };
    }
  }, [contrato]);

  const claimAgentFailure = useCallback(async (polizaId: string | bigint): Promise<ResultadoTx> => {
    let c: Contract | undefined;
    try {
      c = await contrato(true);
      const tx = await c.claimAgentFailure(polizaId);
      await tx.wait();
      return { ok: true, hash: tx.hash };
    } catch (e) {
      return { ok: false, error: errName(e, c) };
    }
  }, [contrato]);

  return useMemo(() => ({ account, esReal, connect, buyCover, claimAgentFailure }), [account, esReal, connect, buyCover, claimAgentFailure]);
}

export type Wallet = ReturnType<typeof useWallet>;
