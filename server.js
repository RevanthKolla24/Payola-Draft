import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'lib.js', 'importer.js']);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!publicFiles.has(name)) { res.writeHead(404); res.end('Not found'); return; }
    const content = await readFile(path.join(root, name));
    res.writeHead(200, {
      'Content-Type': `${types[path.extname(name)]}; charset=utf-8`,
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch { res.writeHead(500); res.end('Unable to serve file'); }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Payola Draft: http://localhost:${server.address().port}`));