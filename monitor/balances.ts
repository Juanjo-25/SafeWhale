import { loadBackendEnvironment } from './load-env.ts';
import { createProvider } from '../web/lib/chain.ts';
import { Wallet, formatEther } from 'ethers';
const { env } = loadBackendEnvironment(); const p = createProvider(env);
try {
  const chainId = Number(BigInt(await p.send('eth_chainId', [])));
  const wallets: Record<string, { address: string; MON: string }> = {};
  for (const name of ['OWNER_PRIVATE_KEY', 'AGENT_PRIVATE_KEY', 'DEMO_USER_PRIVATE_KEY'] as const) {
    if (!env[name]) continue; const address = new Wallet(env[name]).address;
    wallets[name.replace('_PRIVATE_KEY', '')] = { address, MON: formatEther(await p.getBalance(address)) };
  }
  console.log(JSON.stringify({ chainId, wallets }, null, 2));
} catch { console.error('No se pudieron consultar los saldos del RPC.'); process.exitCode = 1; }
finally { p.destroy(); }
