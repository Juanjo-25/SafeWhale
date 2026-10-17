import nextEnv from '@next/env';
import { Wallet, randomBytes, hexlify } from 'ethers';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { webDirectory } from './load-env.ts';

nextEnv.loadEnvConfig(webDirectory, true, { info: () => {}, error: () => { throw new Error('No se pudo cargar el entorno.'); } });
const path = join(webDirectory, '.env.local');
let contents = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return ''; throw error; });
const addresses: Record<string, string> = {};
for (const name of ['OWNER_PRIVATE_KEY', 'AGENT_PRIVATE_KEY', 'DEMO_USER_PRIVATE_KEY']) {
  let key = process.env[name];
  if (!key) {
    key = Wallet.createRandom().privateKey;
    const pattern = new RegExp('^' + name + '=.*$', 'm');
    const line = name + '=' + key;
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : contents + '\n' + line;
  }
  addresses[name.replace('_PRIVATE_KEY', '')] = new Wallet(key).address;
}
if (new Set(Object.values(addresses)).size !== 3) throw new Error('Usa tres wallets de demo distintas.');
if (!process.env.DEMO_API_TOKEN) {
  const line = 'DEMO_API_TOKEN=' + hexlify(randomBytes(32)).slice(2);
  contents = /^DEMO_API_TOKEN=.*$/m.test(contents) ? contents.replace(/^DEMO_API_TOKEN=.*$/m, () => line) : contents + '\n' + line;
}
const temporary = path + '.wallets.tmp';
await writeFile(temporary, contents.trimEnd() + '\n', { mode: 0o600 });
await chmod(temporary, 0o600); await rename(temporary, path);
console.log(JSON.stringify({ ok: true, walletsPublicas: addresses, claves: 'conservadas_solo_en_web/.env.local',
  saldosSugeridosMON: { OWNER: '1.1', AGENT: '0.6', DEMO_USER: '0.1' } }, null, 2));
