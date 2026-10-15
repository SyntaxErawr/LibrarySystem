// Verify installs/builds without the workspace's parent node_modules or any .env.
import { mkdtemp, cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const source = fileURLToPath(new URL('..', import.meta.url));
const prefix = path.join(tmpdir(), 'library-clean-install-');
const target = await mkdtemp(prefix);
async function run(command, cwd) {
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd, env: { ...process.env, VITE_API_URL: 'https://library-api.example.test/api' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Keep dependency output out of user-facing logs; never copy .env into the fixture.
  child.stdout.resume(); child.stderr.resume();
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Clean check failed: ${command} (exit ${code})`))); });
}
try {
  for (const name of ['src', 'public', 'shared', 'server', 'package.json', 'package-lock.json', 'vite.config.js', 'index.html', 'vercel.json']) {
    await cp(path.join(source, name), path.join(target, name), { recursive: true, filter: item => !['node_modules', 'dist', 'test-results', '.git'].includes(path.basename(item)) && !path.basename(item).startsWith('.env') });
  }
  await run('npm ci --no-audit --no-fund', target);
  await run('npm run build', target);
  const html = await readFile(path.join(target, 'dist/index.html'), 'utf8');
  if (!html.includes('School Library')) throw new Error('Clean build output was not generated.');
  const assets = await readdir(path.join(target, 'dist/assets'));
  const javascript = (await Promise.all(assets.filter(name => name.endsWith('.js')).map(name => readFile(path.join(target, 'dist/assets', name), 'utf8')))).join('\n');
  if (javascript.includes('http://localhost:5000/api') || !javascript.includes('https://library-api.example.test/api')) throw new Error('Hosted API configuration was not compiled correctly.');
  console.log('PASS: clean frontend npm ci and production build, without parent dependencies or .env files.');
  await run('npm ci --omit=dev --no-audit --no-fund', path.join(target, 'server'));
  await writeFile(path.join(target, 'server/clean-smoke.cjs'), "const app = require('./server').createApp(); if (!app) process.exitCode = 1; import('../shared/validation.mjs').then(rules => { if (!rules.validEmail('test@example.test')) process.exitCode = 1; });\n");
  await run('node clean-smoke.cjs', path.join(target, 'server'));
  console.log('PASS: clean backend production-only npm ci and Express module load with shared code present.');
} finally {
  // Verified absolute prefix confines recursive deletion to the new temp fixture.
  if (path.resolve(target).startsWith(path.resolve(prefix))) await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
