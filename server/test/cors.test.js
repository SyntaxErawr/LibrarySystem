const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server');
const { runtimeConfig } = require('../config/runtime');

const frontend = 'https://library-system-eta-three.vercel.app';
const routes = ['/api/health', '/api/auth/login', '/api/auth/register'];

for (const enabled of [false, true]) {
  test(`production CORS with local Flutter Web ${enabled ? 'enabled' : 'disabled'}`, async t => {
    const config = runtimeConfig({ NODE_ENV: 'production', CLIENT_URL: frontend, ALLOW_LOCAL_FLUTTER_WEB: String(enabled) });
    const server = createApp(config).listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const locals = ['http://localhost:7357', 'http://localhost:54321', 'http://127.0.0.1:7357', 'http://127.0.0.1:65535'];
    const rejected = ['https://untrusted.example', 'https://localhost:7357', 'http://localhost.evil.example:7357', 'http://127.0.0.2:7357', 'http://localhost:0', 'http://localhost:65536', 'http://localhost', 'http://localhost:7357/', 'http://user@localhost:7357', 'null'];
    for (const origin of [frontend, ...locals, ...rejected]) {
      const allowed = origin === frontend || (enabled && locals.includes(origin));
      for (const route of routes) {
        const response = await fetch(base + route, { headers: { Origin: origin } });
        assert.equal(response.headers.get('access-control-allow-origin'), allowed ? origin : null, `${origin} GET ${route}`);
        // Auth endpoints remain POST-only; GET must reach the normal route handling.
        assert.equal(response.status, allowed ? (route === '/api/health' ? 503 : 404) : 403);
        for (const method of route === '/api/health' ? ['GET'] : ['GET', 'POST']) {
          const preflight = await fetch(base + route, {
            method: 'OPTIONS',
            headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,content-type' },
          });
          assert.equal(preflight.status, allowed ? 204 : 403);
          assert.equal(preflight.headers.get('access-control-allow-origin'), allowed ? origin : null);
          if (allowed) {
            assert.ok(preflight.headers.get('access-control-allow-methods').split(',').includes(method));
            assert.equal(preflight.headers.get('access-control-allow-headers'), 'authorization,content-type');
            assert.match(preflight.headers.get('vary'), /Origin/);
          }
        }
      }
    }
  });
}
