const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtimeConfig } = require('../config/runtime');
test('runtime defaults preserve local development', () => {
  assert.deepEqual(runtimeConfig({}), { port: 5000, clientUrl: 'http://localhost:5173', trustProxy: false, allowLocalFlutterWeb: false });
});
test('production requires explicit HTTPS CORS origin and valid port/proxy settings', () => {
  for (const CLIENT_URL of [undefined, '*', 'http://localhost:5173', 'http://school.example', 'https://school.example/', 'https://school.example/path', 'https://user:pass@school.example']) {
    assert.throws(() => runtimeConfig({ NODE_ENV: 'production', CLIENT_URL }));
  }
  for (const PORT of ['abc', '0', '-1', '70000']) assert.throws(() => runtimeConfig({ PORT }));
  assert.throws(() => runtimeConfig({ TRUST_PROXY: 'true' }));
  assert.deepEqual(runtimeConfig({ NODE_ENV: 'production', CLIENT_URL: 'https://school.example', PORT: '10000', TRUST_PROXY: '1' }), { port: 10000, clientUrl: 'https://school.example', trustProxy: 1, allowLocalFlutterWeb: false });
});

test('local Flutter Web requires an explicit true opt-in in production', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'true']) {
    const config = runtimeConfig({ NODE_ENV: 'production', CLIENT_URL: 'https://library-system-eta-three.vercel.app', ALLOW_LOCAL_FLUTTER_WEB: value });
    assert.equal(config.allowLocalFlutterWeb, value === 'true');
  }
});
