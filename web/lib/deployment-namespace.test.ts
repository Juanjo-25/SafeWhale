import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentNamespace } from '../../monitor/deployment-namespace';

test('otro contrato usa estado independiente y los reintentos conservan el mismo destino', () => {
  const env = { STORAGE_BACKEND: 'supabase', STATE_NAMESPACE: 'presentacion', MONAD_CHAIN_ID: 10143,
    CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001' };
  const target = '0x0000000000000000000000000000000000000002';
  const namespace = deploymentNamespace(env, target);
  assert.notEqual(namespace, env.STATE_NAMESPACE);
  assert.equal(deploymentNamespace(env, target), namespace);
  assert.equal(deploymentNamespace({ ...env, CONTRACT_ADDRESS: target, STATE_NAMESPACE: namespace }, target), namespace);
  assert.equal(deploymentNamespace(env, env.CONTRACT_ADDRESS), env.STATE_NAMESPACE);
  assert.equal(deploymentNamespace({ ...env, STORAGE_BACKEND: 'file' }, target), env.STATE_NAMESPACE);
  assert.match(namespace, /^[a-zA-Z0-9_-]{1,64}$/);
});
