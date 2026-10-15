const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server');
const connectDB = require('../config/db');

const server = createApp().listen(0, '127.0.0.1');
const ready = once(server, 'listening');
after(() => new Promise(resolve => server.close(resolve)));

async function request(route, options) {
  await ready;
  return fetch(`http://127.0.0.1:${server.address().port}${route}`, options);
}

test('API root responds with JSON', async () => {
  const response = await request('/api');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'Library Management System API' });
});
test('health reports unavailable without a database connection', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).database, 'disconnected');
});
test('CORS allows frontend and blocks other browser origins', async () => {
  const allowed = await request('/api', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const blocked = await request('/api', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});
test('API responses set safe headers and preflight allows circulation PATCH', async () => {
  const response = await request('/api');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
  const preflight = await request('/api/borrowings/example/approve', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-methods'), /PATCH/);
});
test('unknown endpoints return JSON 404', async () => {
  const response = await request('/api/missing');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).message, 'API route not found.');
});
test('invalid JSON returns a safe error', async () => {
  const response = await request('/api/books', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Request body must be valid JSON.' });
});
test('database config rejects missing and placeholder URIs', async () => {
  await assert.rejects(connectDB(''), /Set MONGO_URI/);
  await assert.rejects(connectDB('mongodb+srv://<user>:<password>@<cluster>/librarysystem'), /Set MONGO_URI/);
});
