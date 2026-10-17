export const EXPLORER = 'https://testnet.monadvision.com/tx/';

export const SVCS = [
  { id: 1, n: 'Exchange Demo' },
  { id: 2, n: 'Stripe' },
] as const;

export const svcName = (id: number | undefined) => SVCS.find((service) => service.id === id)?.n ?? 'Servicio';

export const hex = (n: number) => {
  let s = '0x';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
};
export const short = (h?: string | null) => (h ? h.slice(0, 6) + '…' + h.slice(-4) : '');
export const num = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('es-CO', { maximumFractionDigits: 3 });
export const mon = (n: number) => num(n) + ' MON';
export const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
export const hms = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const dur = (ms: number) => {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
export const secs = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';
export const fromChain = (v: bigint | number | string) => Number(v) / 1e18;
