import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function start(t, overrides = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '0', LASTFM_API_KEY: '', APPLE_MUSIC_DEVELOPER_TOKEN: '', ENABLE_APPLE_PREVIEW: 'false', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; } });
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/0\.0\.0\.0:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return address;
}
test('production server health, safe availability, methods and public-file isolation', async t => {
  const base = await start(t);
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${base}/api/integrations`)).json(), { lastfm: false, apple: false });
  for (const path of ['/healthz', '/api/integrations']) assert.equal((await fetch(base + path, { method: 'POST' })).status, 405);
  for (const path of ['/.env', '/.env.example', '/server.js', '/.github/workflows/checks.yml', '/README.md']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(`${base}/api/apple/config`)).status, 503);
  assert.equal((await fetch(base)).status, 200);
});
test('availability reports configuration without exposing credentials', async t => {
  const encode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${encode({ alg: 'ES256', kid: 'test' })}.${encode({ iss: 'test', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const base = await start(t, { LASTFM_API_KEY: 'test-secret-key', ENABLE_APPLE_PREVIEW: 'true', APPLE_MUSIC_DEVELOPER_TOKEN: token });
  const response = await fetch(`${base}/api/integrations`);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { lastfm: true, apple: true });
  assert.doesNotMatch(text, /test-secret-key|test-signature|developerToken/);
  const config = await (await fetch(`${base}/api/apple/config`)).json();
  assert.equal(config.developerToken, token);
  const rejected = await fetch(`${base}/api/lastfm?user=test&from=0&to=1`, { headers: { Origin: 'https://example.invalid', 'X-Forwarded-For': '1.2.3.4' } });
  assert.equal(rejected.status, 403);
});
test('invalid Apple tokens never advertise an available preview', async t => {
  const base = await start(t, { ENABLE_APPLE_PREVIEW: 'true', APPLE_MUSIC_DEVELOPER_TOKEN: 'invalid' });
  assert.deepEqual(await (await fetch(`${base}/api/integrations`)).json(), { lastfm: false, apple: false });
});
