'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { ABI } from './abi';
import { fromChain, hex } from './formato';
import { simulador } from './simulador';

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window { ethereum?: Eip1193 }
}

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '').trim();

const MONAD_TESTNET = {
  chainId: '0x279f', // 10143
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadvision.com']
};

export type ResultadoTx = { ok: true; hash: string; id?: number } | { ok: false; error: string };

type ErrorEthers = {
  data?: string;
  info?: { error?: { data?: string } };
  error?: { data?: string };
  revert?: { name?: string };
  shortMessage?: string;
  message?: string;
  code?: number;
};

/** Nombre del custom error del contrato (p. ej. "HorasInvalidas") o el mensaje de ethers. */
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
      const [ph, ind, bono, pool, tope, mh, sm] = await Promise.all([
        c.precioHora(), c.indemnizacion(), c.bonoAgente(), c.poolDisponible(), c.topePorEvento(), c.maxHoras(), c.stakeMinimo()
      ]);
      simulador.setParametros({
        precioHora: fromChain(ph), indemnizacion: fromChain(ind), bono: fromChain(bono), bonoInicial: Math.max(fromChain(sm), fromChain(bono)),
        fondo: fromChain(pool), fondoInicial: fromChain(pool), topePorEvento: Number(tope), maxHoras: Number(mh)
      });
    } catch { /* se quedan los parámetros por defecto */ }
  }, [contrato]);

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
        if ((e as ErrorEthers).code === 4902) await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [MONAD_TESTNET] });
      }
      fijar(acc);
      if (esReal()) cargarParametros();
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
      const log = rc.logs
        .map((l: { topics: string[]; data: string }) => { try { return c!.interface.parseLog(l); } catch { return null; } })
        .find((l: { name: string } | null) => l && l.name === 'CoverComprada');
      return { ok: true, hash: tx.hash, id: log ? Number(log.args.polizaId) : undefined };
    } catch (e) {
      return { ok: false, error: errName(e, c) };
    }
  }, [contrato]);

  const claimAgentFailure = useCallback(async (polizaId: number): Promise<ResultadoTx> => {
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
