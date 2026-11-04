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

test('logo assets and both page themes use the final cream/plum palette', async () => {
  for (const name of ['index.html', 'apple.html']) {
    const html = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.match(html, /name="theme-color" content="#f9efdf"/);
    assert.match(html, /src="\/assets\/logo.png"/);
    assert.match(html, /href="\/assets\/favicon-32.png"/);
    assert.match(html, /href="\/assets\/apple-touch-icon.png"/);
    assert.doesNotMatch(html, /▥/);
  }
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /--paper:#f9efdf/);
  assert.match(css, /--ink:#523a56/);
  assert.doesNotMatch(css, /var\(--(?:green|forest)\)/);
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /ctx.drawImage\(logo/);
  assert.doesNotMatch(app, /#344a34|#f6f5f0|#eef0e6/);
  for (const [name, size] of [['logo', 256], ['favicon-32', 32], ['favicon-192', 192], ['apple-touch-icon', 180]]) {
    const png = await readFile(new URL(`../assets/${name}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});