const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtimeConfig } = require('../config/runtime');
test('runtime defaults preserve local development', () => {
  assert.deepEqual(runtimeConfig({}), { port: 5000, clientUrl: 'http://localhost:5173', trustProxy: false });
});
test('production requires explicit HTTPS CORS origin and valid port/proxy settings', () => {
  for (const CLIENT_URL of [undefined, '*', 'http://localhost:5173', 'http://school.example', 'https://school.example/', 'https://school.example/path', 'https://user:pass@school.example']) {
    assert.throws(() => runtimeConfig({ NODE_ENV: 'production', CLIENT_URL }));
  }
  for (const PORT of ['abc', '0', '-1', '70000']) assert.throws(() => runtimeConfig({ PORT }));
  assert.throws(() => runtimeConfig({ TRUST_PROXY: 'true' }));
  assert.deepEqual(runtimeConfig({ NODE_ENV: 'production', CLIENT_URL: 'https://school.example', PORT: '10000', TRUST_PROXY: '1' }), { port: 10000, clientUrl: 'https://school.example', trustProxy: 1 });
});
