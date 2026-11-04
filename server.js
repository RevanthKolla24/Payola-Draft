import { developerConfiguration } from './apple.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateLastfmQuery, fetchLastfmPage, createLimiter } from './lastfm.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'lib.js', 'importer.js', 'reports.js', 'import-job.js', 'import-worker.js', 'lastfm-client.js', 'apple.html', 'apple-client.js', 'apple.js', 'attribution.js', 'session.js', 'insights.js']);
for (const name of ['logo', 'favicon-32', 'favicon-192', 'apple-touch-icon']) publicFiles.add(`assets/${name}.png`);
const allowGlobal = createLimiter({ limit: 120 });
const clients = new Map(); let activeRequests = 0;
function integrationStatus() {
  let apple = false;
  if (process.env.ENABLE_APPLE_PREVIEW === 'true') {
    try { developerConfiguration(process.env.APPLE_MUSIC_DEVELOPER_TOKEN); apple = true; } catch { /* No credentials or diagnostics in public status. */ }
  }
  return { lastfm: Boolean(process.env.LASTFM_API_KEY?.trim()), apple };
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(body));
}
async function lastfmRequest(req, res, url) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status, error) => { res.writeHead(status); res.end(JSON.stringify({ error })); };
  if (req.method !== 'GET') { reply(405, 'Only GET is supported.'); return; }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) { reply(403, 'Cross-origin requests are not allowed.'); return; }
  let query; try { query = validateLastfmQuery(url.searchParams); } catch (error) { reply(400, error.message); return; }
  if (!process.env.LASTFM_API_KEY) { reply(503, 'Last.fm is not configured. Set LASTFM_API_KEY on the server and restart it. No password is needed.'); return; }
  const ip = req.socket.remoteAddress;
  for (const [address, client] of clients) if (Date.now() - client.updated > 60000) clients.delete(address);
  if (!clients.has(ip)) {
    if (clients.size >= 1000) { reply(429, 'Server busy. Try later.'); return; }
    clients.set(ip, { allow: createLimiter({ limit: 100 }), updated: Date.now() });
  }
  const client = clients.get(ip); client.updated = Date.now();
  if (activeRequests >= 4 || !client.allow() || !allowGlobal()) { res.setHeader('Retry-After', '60'); reply(429, 'Request limit reached. Wait one minute before refreshing.'); return; }
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort(); res.on('close', abort); activeRequests++;
  try {
    const result = await fetchLastfmPage(query, process.env.LASTFM_API_KEY, fetch, controller.signal);
    if (!res.destroyed) { res.writeHead(200); res.end(JSON.stringify(result)); }
  } catch (error) {
    if (!res.destroyed) reply(502, error.name === 'AbortError' ? 'Last.fm request timed out. Try again.' : 'Last.fm could not provide this history. Check the username and privacy settings, or try again later.');
  } finally { clearTimeout(timeout); res.off('close', abort); activeRequests--; }
}
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz' || url.pathname === '/api/integrations') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(res, 405, { error: 'Only GET is supported.' }); return; }
      json(res, 200, url.pathname === '/healthz' ? { status: 'ok' } : integrationStatus());
      return;
    }
    if (url.pathname === '/api/apple/config') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') { res.writeHead(405); res.end(JSON.stringify({ error: 'Only GET is supported.' })); return; }
      if (process.env.ENABLE_APPLE_PREVIEW !== 'true') { json(res, 503, { error: 'Apple Music preview is disabled on this site.' }); return; }
      try { const config = developerConfiguration(process.env.APPLE_MUSIC_DEVELOPER_TOKEN); res.writeHead(200); res.end(JSON.stringify(config)); }
      catch (error) { res.writeHead(503); res.end(JSON.stringify({ error: error.message })); }
      return;
    }
    if (url.pathname === '/api/lastfm') { await lastfmRequest(req, res, url); return; }
    const name = url.pathname.slice(1) || 'index.html';
    if (!publicFiles.has(name)) { res.writeHead(404); res.end('Not found'); return; }
    const content = await readFile(path.join(root, name));
    res.writeHead(200, {
      'Content-Type': types[path.extname(name)] + (name.endsWith('.png') ? '' : '; charset=utf-8'),
      'Content-Security-Policy': `default-src 'self'; script-src 'self'${name === 'apple.html' ? ' https://js-cdn.music.apple.com' : ''}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'${name === 'apple.html' ? ' https://*.apple.com https://*.itunes.apple.com' : ''}; frame-src ${name === 'apple.html' ? 'https://*.apple.com https://*.itunes.apple.com' : "'none'"}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch { res.writeHead(500); res.end('Unable to serve file'); }
});
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
server.listen(port, host, () => console.log(`Payola Draft listening on ${host}:${server.address().port}`));