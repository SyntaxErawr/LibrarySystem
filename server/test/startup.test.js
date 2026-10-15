const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { category, startupStage } = require('../config/startupDiagnostics');

test('startup diagnostics classify failures without echoing sensitive driver fields', async () => {
  for (const [error, expected] of [
    [{ code: 18 }, 'database-authentication'], [{ code: 13 }, 'database-permission'],
    [{ code: 11000 }, 'duplicate-data-index'], [{ code: 85 }, 'index-definition-conflict'],
    [{ code: 'ENOTFOUND' }, 'dns-or-network'], [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'tls'],
    [{ code: 'EADDRINUSE' }, 'port-in-use'], [{ name: 'MongoParseError' }, 'database-uri-format'],
    [{ name: 'MongooseServerSelectionError' }, 'database-network-or-selection'],
    [{ message: 'Configure a JWT secret of at least 32 characters.' }, 'configuration-jwt_secret'],
  ]) assert.equal(category(error), expected);
  const secret = 'private-driver-payload';
  const lines = [];
  const error = Object.assign(new Error(secret), { code: 18, cause: new Error(secret) });
  await assert.rejects(startupStage('database-connect', () => { throw error; }, line => lines.push(line), line => lines.push(line)));
  assert.match(lines.join('\n'), /stage=database-connect status=failed category=database-authentication/);
  assert.equal(lines.join('\n').includes(secret), false);
  assert.equal(await startupStage('environment', () => 42, () => {}), 42);
});

test('production ignores local env file and reports missing injected configuration safely', () => {
  const env = { ...process.env, NODE_ENV: 'production', CLIENT_URL: '', JWT_SECRET: '', MONGO_URI: '' };
  const result = spawnSync(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stage=environment status=failed category=configuration-client_url/);
  assert.equal(result.stderr.includes('mongodb'), false);
});
