// Read-only source/database audit and a noninteractive production-mode startup.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const mongoose = require('mongoose');
require('../server');
const connectDB = require('../config/db');
const root = path.resolve(__dirname, '../..');
async function scan(directory, needles) {
  let hits = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'test-results'].includes(entry.name) || entry.name.startsWith('.env')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) hits += await scan(filename, needles);
    else if (/\.(js|jsx|mjs|cjs|json|html|css|md|svg|ps1|ya?ml)$/.test(entry.name)) {
      const value = await fs.readFile(filename, 'utf8');
      if (needles.some(needle => value.includes(needle))) hits++;
    }
  }
  return hits;
}
(async () => {
  let child;
  try {
    const needles = [process.env.MONGO_URI, process.env.JWT_SECRET].filter(value => value && value.length > 12);
    assert.equal(await scan(root, needles), 0);
    for (const filename of ['.gitignore', 'server/.gitignore']) assert.match(await fs.readFile(path.join(root, filename), 'utf8'), /^\.env$/m);
    let gitAvailable = false;
    try {
      const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      gitAvailable = true;
      assert.equal(tracked.split(/\r?\n/).filter(file => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')).length, 0);
    } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
    console.log(JSON.stringify({ sourceAndBuildSecretScan: 'passed', secretIgnorePatterns: 'passed', gitTrackedFileAudit: gitAvailable ? 'passed' : 'not available: no repository' }));
    await connectDB();
    const db = mongoose.connection;
    const active = { returnedAt: null, status: { $in: ['borrowed', 'overdue'] } };
    const mismatches = await db.collection('books').aggregate([
      { $lookup: { from: 'borrowings', let: { id: '$_id' }, pipeline: [{ $match: { ...active, $expr: { $eq: ['$book', '$$id'] } } }, { $count: 'count' }], as: 'loans' } },
      { $set: { actualLoans: { $ifNull: [{ $arrayElemAt: ['$loans.count', 0] }, 0] } } },
      { $match: { $expr: { $or: [{ $ne: ['$actualLoans', { $subtract: ['$totalCopies', '$availableCopies'] }] }, { $lt: ['$availableCopies', 0] }, { $gt: ['$availableCopies', '$totalCopies'] }] } } }, { $count: 'count' },
    ]).toArray();
    assert.equal(mismatches[0]?.count || 0, 0);
    const orphans = await db.collection('borrowings').aggregate([
      { $match: active }, { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'bookRef' } },
      { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 'studentRef' } },
      { $match: { $or: [{ bookRef: { $size: 0 } }, { studentRef: { $size: 0 } }] } }, { $count: 'count' },
    ]).toArray();
    assert.equal(orphans[0]?.count || 0, 0);
    const [users, books, loans] = await Promise.all(['users', 'books', 'borrowings'].map(name => db.collection(name).indexes()));
    assert.ok(users.some(index => index.key.email && index.unique));
    assert.ok(users.some(index => index.key.studentId && index.unique));
    assert.ok(books.some(index => index.key.isbn && index.unique));
    assert.ok(loans.some(index => index.unique && index.partialFilterExpression?.status === 'borrowed'));
    assert.ok(loans.some(index => index.unique && index.partialFilterExpression?.status === 'pending'));
    console.log('PASS: read-only Atlas inventory/loan consistency, active references and required unique indexes.');
    const probe = net.createServer().listen(0, '127.0.0.1');
    await new Promise(resolve => probe.once('listening', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'server/package.json'), 'utf8'));
    assert.equal(pkg.scripts.start, 'node server.js');
    child = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'server'), windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production', CLIENT_URL: 'https://library.example.test', TRUST_PROXY: '0', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.resume();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 20000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('Library API listening')) { clearTimeout(timer); resolve(); } });
      child.once('error', reject); child.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Startup failed')); });
    });
    const origin = `http://127.0.0.1:${port}`;
    const health = await fetch(`${origin}/api/health`); assert.equal(health.status, 200); assert.equal((await health.json()).database, 'connected');
    assert.equal((await fetch(`${origin}/api/auth/me`)).status, 401);
    const allowed = await fetch(`${origin}/api`, { headers: { Origin: 'https://library.example.test' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://library.example.test');
    const blocked = await fetch(`${origin}/api`, { headers: { Origin: 'http://localhost:5173' } }); assert.equal(blocked.status, 403);
    console.log('PASS: npm start target starts noninteractively on configured PORT/all interfaces; production-mode Atlas health, authorization and exact-origin CORS.');
  } catch (error) { console.error(JSON.stringify({ readinessAudit: 'failed', errorType: error.name })); process.exitCode = 1; }
  finally { if (child && child.exitCode === null) child.kill('SIGTERM'); await mongoose.disconnect(); }
})();
