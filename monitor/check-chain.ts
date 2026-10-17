import { loadBackendEnvironment } from './load-env.ts';
import { createChainContext } from '../web/lib/chain.ts';
import { formatEther } from 'ethers';
import { ApiError } from '../web/lib/api.ts';
try {
  const { env } = loadBackendEnvironment(); const ctx = await createChainContext(env);
  try { console.log(JSON.stringify({ ok: true, chainId: env.MONAD_CHAIN_ID, contrato: env.CONTRACT_ADDRESS,
    bloqueDespliegue: env.CONTRACT_DEPLOY_BLOCK, agente: ctx.agent.address, usuarioDemo: ctx.user.address,
    fondo: formatEther(await ctx.contract.fundBalance()), bono: formatEther(await ctx.contract.bondBalance()),
    comprobacion: 'RPC_bytecode_roles_y_bono_verificados' }, null, 2)); }
  finally { ctx.provider.destroy(); }
} catch (error) { console.error(error instanceof ApiError ? error.codigo + ': ' + error.message : 'Configura contrato, bloque y wallets antes de comprobar la cadena.'); process.exitCode = 1; }
