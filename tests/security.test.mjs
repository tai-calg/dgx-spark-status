import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertSecureRemoteConfig,
  getServerHost,
  isBasicAuthorized,
  requestRequiresAuthentication
} from '../src/lib/server/security.js';

const token = '0123456789abcdef0123456789abcdef';

function requestWithBasic(username, password) {
  return new Request('http://example.test/', {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    }
  });
}

test('localhost is the default bind address', () => {
  assert.equal(getServerHost({}), '127.0.0.1');
});

test('remote mode fails closed without a sufficiently long token', () => {
  assert.throws(() => assertSecureRemoteConfig({ DGX_ALLOW_REMOTE: '1', DGX_DASHBOARD_TOKEN: 'short' }));
  assert.doesNotThrow(() => assertSecureRemoteConfig({ DGX_ALLOW_REMOTE: '1', DGX_DASHBOARD_TOKEN: token }));
});

test('remote clients require authentication even if remote mode was not explicitly enabled', () => {
  assert.equal(
    requestRequiresAuthentication({ clientAddress: '192.168.1.20', hostname: '192.168.1.10', env: {} }),
    true
  );
  assert.equal(
    requestRequiresAuthentication({ clientAddress: '127.0.0.1', hostname: 'localhost', env: {} }),
    false
  );
});

test('basic authentication accepts only the fixed username and configured token', () => {
  const env = { DGX_DASHBOARD_TOKEN: token };
  assert.equal(isBasicAuthorized(requestWithBasic('dgx', token), env), true);
  assert.equal(isBasicAuthorized(requestWithBasic('dgx', 'wrong-token-wrong-token'), env), false);
  assert.equal(isBasicAuthorized(requestWithBasic('admin', token), env), false);
});

test('Ollama route never interpolates request data into a shell command', () => {
  const source = readFileSync(new URL('../src/routes/api/ollama/+server.js', import.meta.url), 'utf8');
  assert.match(source, /execFile/);
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /execAsync|\bexec\s*\(/);
  assert.doesNotMatch(source, /ollama\s+(pull|rm)\s+\$\{/);
});
