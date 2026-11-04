import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('site and project metadata consistently use Payola Draft', async () => {
  const files = ['index.html', 'app.js', 'package.json', 'server.js', 'README.md'];
  const contents = await Promise.all(files.map(name => readFile(new URL(`../${name}`, import.meta.url), 'utf8')));
  for (const [index, text] of contents.entries()) {
    assert.doesNotMatch(text, /listening[ -]receipt/i, `${files[index]} contains old branding`);
    assert.match(text, /payola[ -]draft/i, `${files[index]} is missing branding`);
  }
  assert.match(contents[0], /<title>Payola Draft — Your listening\. By the numbers\.<\/title>/);
  assert.match(contents[0], /aria-label="Payola Draft home"/);
  assert.doesNotMatch(contents[0], /®/);
  assert.match(contents[1], /payola-draft-artist-\$\{style\}-\$\{source\}\.png/);
  assert.match(contents[1], /payola-draft-\$\{source\}\.png/);
  assert.equal(JSON.parse(contents[2]).name, 'payola-draft');
});