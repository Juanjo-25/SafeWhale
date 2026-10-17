import { Contract, ContractFactory, Wallet, formatEther, keccak256, type TransactionRequest, type TransactionReceipt } from 'ethers';
import { readFile, writeFile, rename, chmod, mkdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { z } from 'zod';
import { loadBackendEnvironment, webDirectory } from './load-env.ts';
import { deploymentNamespace } from './deployment-namespace.ts';
import { createProvider } from '../web/lib/chain.ts';
import { withFileStore } from '../web/lib/file-store.ts';
import { DEMO_FUNDING, demoConstructorArgs } from '../shared/config.ts';
import type { Address } from '../shared/types.ts';
import artifact from '../contracts/DowntimeCover (1).json';

const schema = z.object({ identity: z.string(), address: z.string().optional(), block: z.number().optional(),
  operations: z.record(z.string(), z.object({ raw: z.string().optional(), hash: z.string(), confirmed: z.boolean() })) });
try {
  const { env, stateFile: configuredStateFile } = loadBackendEnvironment();
  const newStateFile = process.argv.find((arg) => arg.startsWith('--new-state-file='))?.slice('--new-state-file='.length);
  if (newStateFile && !isAbsolute(newStateFile)) throw new Error('--new-state-file debe ser una ruta absoluta estable para poder reintentar.');
  const stateFile = newStateFile ?? configuredStateFile;
  if (!env.OWNER_PRIVATE_KEY || !env.AGENT_PRIVATE_KEY || !env.DEMO_USER_PRIVATE_KEY || !env.DEMO_API_TOKEN)
    throw new Error('Ejecuta pnpm wallets:init antes de desplegar.');
  const provider = createProvider(env);
  try {
    if (Number(BigInt(await provider.send('eth_chainId', []))) !== 10143) throw new Error('El RPC no está en Monad Testnet (10143).');
    const owner = new Wallet(env.OWNER_PRIVATE_KEY, provider), agent = new Wallet(env.AGENT_PRIVATE_KEY, provider), user = new Wallet(env.DEMO_USER_PRIVATE_KEY, provider);
    const args = demoConstructorArgs(agent.address as Address);
    const identity = JSON.stringify({ chainId: 10143, owner: owner.address, agent: agent.address, user: user.address, args: args.map(String), bytecode: keccak256('0x' + artifact.data.bytecode.object) });
    const deployment = await withFileStore(stateFile + '.deployment.json', (): z.infer<typeof schema> => ({ identity, operations: {} }), (value) => schema.parse(value), async (state, save) => {
      if (state.identity !== identity) throw new Error('El journal pertenece a otro despliegue. Usa otra STATE_FILE; no se borró el anterior.');
      if (!newStateFile && env.CONTRACT_ADDRESS && state.address?.toLowerCase() !== env.CONTRACT_ADDRESS.toLowerCase()) throw new Error('Ya hay otro contrato configurado. Conserva su estado y usa una nueva STATE_FILE para otra instancia.');
      const balances = await Promise.all([owner, agent, user].map((w) => provider.getBalance(w.address)));
      console.log(JSON.stringify({ wallets: { owner: owner.address, agent: agent.address, user: user.address }, saldosMON: balances.map(formatEther) }));
      const agentTarget = 600_000_000_000_000_000n, userTarget = 100_000_000_000_000_000n;
      const agentTopup = balances[1] < agentTarget ? agentTarget - balances[1] : 0n;
      const userTopup = balances[2] < userTarget ? userTarget - balances[2] : 0n;
      if (!state.address && balances[0] < DEMO_FUNDING.fondo + agentTopup + userTopup + 20_000_000_000_000_000n)
        throw new Error('Faltan MON de testnet para fondo, bono y gas. Usa el faucet con la dirección pública owner.');
      const send = async (name: string, signer: Wallet, prepare: () => Promise<TransactionRequest>): Promise<TransactionReceipt> => {
        let op = state.operations[name];
        if (!op) {
          const transaction = await signer.populateTransaction(await prepare());
          transaction.gasLimit = BigInt(transaction.gasLimit!) * 120n / 100n;
          const raw = await signer.signTransaction(transaction);
          op = { raw, hash: keccak256(raw), confirmed: false }; state.operations[name] = op; await save();
        }
        let receipt = await provider.getTransactionReceipt(op.hash);
        if (!receipt) {
          if (!op.raw) throw new Error('El receipt de un envío confirmado no está disponible. Revisa la red.');
          if (!await provider.getTransaction(op.hash)) {
            try { await provider.broadcastTransaction(op.raw); } catch { /* Reconciliar siempre el mismo hash. */ }
          }
          receipt = await provider.waitForTransaction(op.hash, 1, 60000);
        }
        if (!receipt || receipt.status !== 1) throw new Error('El envío sigue pendiente o fue revertido. Repite pnpm deploy:testnet para reconciliarlo.');
        op.confirmed = true; delete op.raw; await save(); console.log(name + ': ' + receipt.hash); return receipt;
      };
      if (!state.address && agentTopup > 0n) await send('topup-agent', owner, async () => ({ to: agent.address, value: agentTopup }));
      if (!state.address && userTopup > 0n) await send('topup-user', owner, async () => ({ to: user.address, value: userTopup }));
      if (!state.address) {
        const factory = new ContractFactory(artifact.abi, artifact.data.bytecode.object, owner);
        const receipt = await send('deploy', owner, () => factory.getDeployTransaction(...args));
        if (!receipt.contractAddress) throw new Error('No se recibió la dirección del contrato.');
        state.address = receipt.contractAddress; state.block = receipt.blockNumber; await save();
      }
      const c = new Contract(state.address, artifact.abi, provider);
      if ((await c.owner()).toLowerCase() !== owner.address.toLowerCase() || (await c.agent()).toLowerCase() !== agent.address.toLowerCase()) throw new Error('Los roles del contrato no corresponden a las wallets configuradas.');
      if (!state.operations.fund?.confirmed && await c.fundBalance() < DEMO_FUNDING.fondo)
        await send('fund', owner, async () => c.connect(owner).getFunction('fund').populateTransaction({ value: DEMO_FUNDING.fondo - await c.fundBalance() }));
      if (!state.operations.bond?.confirmed && await c.bondBalance() < DEMO_FUNDING.bono)
        await send('bond', agent, async () => c.connect(agent).getFunction('stakeBond').populateTransaction({ value: DEMO_FUNDING.bono - await c.bondBalance() }));
      // El bono está en el contrato; el agente necesita además gas en su wallet.
      const fee = await provider.getFeeData();
      const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
      if (!gasPrice) throw new Error('No se pudo estimar el presupuesto de gas del agente.');
      const gasTarget = (BigInt(args[7]) * 200000n + 300000n) * gasPrice;
      const agentBalance = await provider.getBalance(agent.address);
      if (!state.operations['agent-gas']?.confirmed && agentBalance < gasTarget) {
        const amount = gasTarget - agentBalance;
        const userBalance = await provider.getBalance(user.address);
        const funder = userBalance > amount + 200_000_000_000_000_000n ? user : owner;
        if (await provider.getBalance(funder.address) < amount + 10_000_000_000_000_000n)
          throw new Error('El contrato está desplegado, pero falta MON de testnet para el gas del agente. Fondea owner o usuario y repite el comando.');
        await send('agent-gas', funder, async () => ({ to: agent.address, value: amount }));
        console.log('Presupuesto de gas del agente: ' + formatEther(gasTarget) + ' MON.');
      }
      return { chainId: 10143, address: state.address, bloque: state.block!, agent: agent.address, owner: owner.address };
    });
    const envPath = join(webDirectory, '.env.local');
    let content = await readFile(envPath, 'utf8');
    for (const [name, value] of Object.entries({ CONTRACT_ADDRESS: deployment.address, CONTRACT_DEPLOY_BLOCK: deployment.bloque,
      BACKEND_MODE: 'testnet', STATE_FILE: stateFile, STATE_NAMESPACE: deploymentNamespace(env, deployment.address) })) {
      const pattern = new RegExp('^' + name + '=.*$', 'm'); const line = name + '=' + value;
      content = pattern.test(content) ? content.replace(pattern, () => line) : content + '\n' + line;
    }
    const temp = envPath + '.deployment.tmp'; await writeFile(temp, content, { mode: 0o600 }); await chmod(temp, 0o600); await rename(temp, envPath);
    const history = new URL('../shared/deployments/', import.meta.url); await mkdir(history, { recursive: true });
    const previousDeployment = JSON.parse(await readFile(new URL('../shared/deployment.json', import.meta.url), 'utf8')) as { address: string } | null;
    if (previousDeployment) await writeFile(new URL(previousDeployment.address + '.json', history), JSON.stringify(previousDeployment, null, 2) + '\n');
    await writeFile(new URL(deployment.address + '.json', history), JSON.stringify(deployment, null, 2) + '\n');
    await writeFile(new URL('../shared/deployment.json', import.meta.url), JSON.stringify(deployment, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, ...deployment, siguiente: 'Reinicia pnpm dev y ejecuta pnpm monitor.' }, null, 2));
  } finally { provider.destroy(); }
} catch (error) {
  // Solo errores propios; nunca imprimir objetos/requests de ethers ni claves.
  const text = error instanceof Error && !('code' in error) ? error.message : 'No se pudo desplegar. Revisa RPC, saldos y el journal; no se reenviará con otro nonce.';
  console.error(text); process.exitCode = 1;
}
