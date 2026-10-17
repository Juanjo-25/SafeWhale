import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const sourcePath = new URL('./DowntimeCover (1).sol', import.meta.url);
const artifactPath = new URL('./DowntimeCover (1).json', import.meta.url);
const sharedAbiPath = new URL('../shared/abi.json', import.meta.url);

export function compileContract(evmVersion) {
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { 'DowntimeCover.sol': { content: readFileSync(sourcePath, 'utf8') } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      ...(evmVersion ? { evmVersion } : {}),
      outputSelection: { '*': { '*': [
        'abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.gasEstimates', 'evm.methodIdentifiers',
      ] } },
    },
  })));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  return output.contracts['DowntimeCover.sol'].DowntimeCover;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const compiled = compileContract();
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  artifact.data = compiled.evm;
  artifact.abi = compiled.abi;
  writeFileSync(artifactPath, JSON.stringify(artifact, null, '\t') + '\n');
  writeFileSync(sharedAbiPath, JSON.stringify(compiled.abi, null, 2) + '\n');
  console.log(`DowntimeCover compilado con ${solc.version()}. Artefacto y shared/abi.json actualizados.`);
}
