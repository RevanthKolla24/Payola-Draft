import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('workspace separates import, results, backups and optional accounts', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const positions = ['id="add-listening"', 'id="dashboard"', 'id="history-workspace"', 'id="accounts"', 'id="help-privacy"'].map(id => html.indexOf(id));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /id="open-account" aria-controls="accounts"/);
  assert.match(html, /<details class="history-info">/);
  assert.match(html, /<details class="track-disclosure">/);
  assert.match(html, /<dialog id="artist-dialog" aria-labelledby="artist-dialog-heading">/);
  assert.match(html, /PLAY RANK<\/th>/);
  assert.match(html, /href="\/workspace.css"/);
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /publicFiles.add\('workspace.css'\)/);
  for (const page of ['/', '/dashboard', '/import', '/receipt', '/history', '/account', '/help']) {
    assert.ok(html.includes(`data-page="${page}"`));
  }
  assert.match(html, /href="\/pages.css"/);
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /scrollIntoView/);
});