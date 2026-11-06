import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { visitControl } from './page-helpers.mjs';
import { sessionText } from '../session.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch();
const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base + '/') && !request.url().startsWith('blob:')) external.push(request.url()); });
  await page.route('**/api/integrations', route => route.fulfill({ json: { lastfm: false, apple: false } }));
  await page.goto(base + '/import');
  await page.locator('[data-mode="csv"]').click();
  const file = { name: 'private-file.csv', mimeType: 'text/csv', buffer: Buffer.from('Day,Who,Song,Duration\n2026-01-01,<private artist>,Secret song,60000\n2026-01-02,Other artist,Unknown,\n2026-01-03,Other artist,Short,100\ninvalid,Other artist,Bad,60000') };
  await page.locator('#history-files').setInputFiles(file);
  await page.waitForFunction(() => document.querySelectorAll('[data-guide-key]').length === 4);
  assert.equal(await page.locator('#stat-plays').textContent(), '0');
  for (const [key, column] of [['date', 'Day'], ['artist', 'Who'], ['track', 'Song'], ['ms', 'Duration']]) await page.locator(`[data-guide-key="${key}"]`).selectOption(column);
  await page.locator('#csv-refresh-preview').click();
  await page.waitForFunction(() => !document.querySelector('#csv-stage').disabled);
  assert.match(await page.locator('#csv-preview').textContent(), /2 included · 1 invalid · 1 short/);
  await page.locator('[data-guide-key="ms"]').selectOption('');
  assert.equal(await page.locator('#csv-stage').isDisabled(), true, 'Changing mapping invalidates the preview');
  await page.locator('[data-guide-key="ms"]').selectOption('Duration');
  await page.locator('#csv-refresh-preview').click();
  await page.waitForFunction(() => !document.querySelector('#csv-stage').disabled);
  assert.equal(await page.locator('#csv-preview private').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('payola-csv-mapping')), null);
  await page.locator('#remember-csv-mapping').check();
  await page.locator('#csv-stage').click();
  await page.locator('#confirm-import').waitFor();
  assert.equal(await page.locator('#stat-plays').textContent(), '0');
  await page.locator('#confirm-import').click();
  assert.equal(await page.locator('#stat-plays').textContent(), '2');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('payola-csv-mapping'))), { date: 'Day', artist: 'Who', track: 'Song', ms: 'Duration' });
  await visitControl(page, '#quality-report');
  assert.match(await page.locator('#quality-report').textContent(), /Included with unknown duration/);
  assert.match(await page.locator('#quality-files').textContent(), /private-file.csv/);
  assert.match(await page.locator('#personal-recap').textContent(), /Secret song/);
  assert.match(await page.locator('#listening-patterns').textContent(), /Unavailable/);
  page.once('dialog', dialog => dialog.accept());
  let pending = page.waitForEvent('download');
  await page.locator('#download-diagnostics').click();
  const diagnostics = await readFile(await (await pending).path(), 'utf8');
  assert.doesNotMatch(diagnostics, /private-file|private artist|Secret song|eventKey/);
  await page.locator('.artist-button').first().click();
  assert.match(await page.locator('.artist-deep-dive').textContent(), /First observed: 2026-01-01/);
  assert.match(await page.locator('.artist-deep-dive').textContent(), /50.0%/);
  await page.keyboard.press('Escape');
  await visitControl(page, '#receipt-theme');
  await page.locator('#receipt-theme').selectOption('night');
  await page.locator('#receipt-count').selectOption('10');
  await page.locator('#preview-receipt').click();
  await page.waitForFunction(() => document.querySelector('#receipt-preview-image').naturalWidth === 1000);
  assert.equal(await page.locator('#receipt-preview-dialog').evaluate(el => el.open), true);
  assert.equal(await page.locator('#receipt-preview-image').evaluate(el => el.naturalHeight), 1826);
  await page.locator('#close-receipt-preview').click();
  await page.waitForFunction(() => !document.querySelector('#receipt-preview-image').hasAttribute('src'));
  assert.equal(await page.locator('#receipt-preview-image').getAttribute('src'), null);
  await visitControl(page, '#date-toggle');
  await page.locator('#date-toggle').click();
  await page.locator('#from-date').fill('2026-01-02');
  await page.locator('#date-form button[type="submit"]').click();
  await visitControl(page, '#history-files');
  await page.locator('#csv-guided').uncheck();
  await page.evaluate(() => {
    window.heldImportResults = [];
    window.Worker = class extends Worker {
      set onmessage(handler) {
        super.onmessage = event => {
          if (event.data.type === 'done') window.heldImportResults.push(() => handler(event));
          else handler(event);
        };
      }
    };
  });
  const replacement = { name: 'replacement.csv', mimeType: 'text/csv', buffer: Buffer.from('Day,Who,Song,Duration\n2026-02-01,Replacement artist,Replacement song,60000') };
  await page.locator('#import-action').selectOption('replace');
  await page.locator('#history-files').setInputFiles(replacement);
  await page.waitForFunction(() => window.heldImportResults.length === 1);
  async function assertImportLocked() {
    for (const id of ['csv-guided', 'history-files', 'import-action', 'csv-date']) assert.equal(await page.locator(`#${id}`).isDisabled(), true, `${id} stays locked`);
  }
  await assertImportLocked();
  await page.evaluate(() => document.querySelector('#csv-guided').dispatchEvent(new Event('change')));
  await assertImportLocked();
  // Even synthetic file events must not start another import while one is pending.
  await page.locator('#history-files').setInputFiles(replacement);
  await page.evaluate(() => window.heldImportResults.shift()());
  await page.locator('#confirm-import').waitFor();
  await assertImportLocked();
  await page.evaluate(() => {
    document.querySelector('#csv-guided').dispatchEvent(new Event('change'));
    document.querySelector('#import-action').value = 'add';
  });
  await assertImportLocked();
  await page.locator('#confirm-import').click();
  assert.equal(await page.locator('#from-date').inputValue(), '', 'Replacement uses the staged action, not a later control value');
  assert.equal(await page.locator('#stat-plays').textContent(), '1');
  assert.match(await page.locator('#quality-files').textContent(), /replacement.csv/);
  assert.doesNotMatch(await page.locator('#quality-files').textContent(), /private-file.csv/);
  assert.equal(await page.locator('#csv-guided').isEnabled(), true);
  await page.locator('#history-files').setInputFiles(file);
  await page.waitForFunction(() => window.heldImportResults.length === 1);
  await page.locator('#cancel-import').click();
  await page.evaluate(() => window.heldImportResults.shift()());
  assert.equal(await page.locator('#confirm-import').count(), 0);
  assert.equal(await page.locator('#stat-plays').textContent(), '1');
  assert.equal(await page.locator('#csv-guided').isEnabled(), true);
  page.once('dialog', dialog => dialog.accept());
  await visitControl(page, '[data-mode="manual"]'); await page.locator('[data-mode="manual"]').click();
  await page.locator('#manual-rows [name="artist"]').fill('First'); await page.locator('#manual-rows [name="plays"]').fill('10');
  await page.locator('#manual-add').click();
  await page.locator('#manual-rows [name="artist"]').nth(1).fill('Second'); await page.locator('#manual-rows [name="plays"]').nth(1).fill('20');
  await page.locator('#manual-form button[type="submit"]').click();
  assert.equal(await page.locator('#stat-plays').textContent(), '30');
  assert.equal(await page.locator('#stat-artists').textContent(), '2');
  await visitControl(page, '#save-session');
  page.once('dialog', dialog => dialog.accept()); pending = page.waitForEvent('download'); await page.locator('#save-session').click();
  const backup = await readFile(await (await pending).path(), 'utf8');
  assert.equal(JSON.parse(backup).version, 2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#restore-session').setInputFiles({ name: 'manual.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.waitForFunction(() => document.querySelector('#manual-rows [name="artist"]').value === 'Second');
  assert.equal(await page.locator('#manual-rows [name="artist"]').first().inputValue(), 'Second');
  const timed = sessionText({ mode: 'import', selectedService: 'spotify', records: [{ date: '2026-01-01', timestamp: '2026-01-01T23:00:00.000Z', artist: 'Timed', track: 'Clock', ms: 3600000, supported: true }, { date: '2026-01-02', timestamp: '2026-01-02T00:00:00.000Z', artist: 'Timed', track: 'Clock', ms: 3600000, supported: true }], filters: { from: '', to: '' }, duplicates: 0 });
  await page.locator('#compare-file-a').setInputFiles({ name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.locator('#compare-file-b').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(timed) });
  await page.locator('#compare-sessions').click();
  await page.waitForFunction(() => !document.querySelector('#download-comparison').hidden);
  assert.match(await page.locator('#session-comparison').textContent(), /0 shared artists/);
  assert.equal(await page.locator('#stat-plays').textContent(), '30', 'Comparison cannot replace the open history');
  await page.locator('#clear-session-comparison').click();
  assert.equal(await page.locator('#download-comparison').isVisible(), false);
  const emptyLastfm = sessionText({ mode: 'lastfm', selectedService: 'spotify', records: [], filters: { from: '', to: '' }, duplicates: 0, attribution: { service: 'unknown', confirmed: false, scenario: false, from: '2026-01-01', to: '2026-01-01' }, lastfm: { skipped: 0, duplicates: 0 } });
  for (const id of ['a', 'b']) await page.locator(`#compare-file-${id}`).setInputFiles({ name: `${id}.json`, mimeType: 'application/json', buffer: Buffer.from(emptyLastfm) });
  await page.locator('#compare-sessions').click();
  await page.waitForFunction(() => !document.querySelector('#download-comparison').hidden);
  assert.match(await page.locator('#session-comparison').textContent(), /Duration unknown/);
  assert.doesNotMatch(await page.locator('#session-comparison').textContent(), /0\.0 hours/);
  await page.locator('#compare-file-a').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await page.locator('#compare-file-b').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(timed) });
  await page.locator('#compare-sessions').click();
  await page.waitForFunction(() => document.querySelector('#session-comparison').textContent.includes('Open history is unchanged'));
  assert.equal(await page.locator('#download-comparison').isVisible(), false);
  assert.equal(await page.locator('#stat-plays').textContent(), '30');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#restore-session').setInputFiles({ name: 'timed.json', mimeType: 'application/json', buffer: Buffer.from(timed) });
  await page.waitForFunction(() => document.querySelector('#stat-plays').textContent === '2');
  await visitControl(page, '#listening-patterns');
  assert.match(await page.locator('#listening-patterns').textContent(), /2 of 2/);
  assert.match(await page.locator('#listening-patterns').textContent(), /run: 2 days/);
  await visitControl(page, '#receipt-metric');
  await page.locator('#receipt-metric').selectOption('hours');
  await page.locator('#receipt-theme').selectOption('mint');
  await page.evaluate(() => {
    window.featureCardText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(...args) { window.featureCardText.push(args[0]); return original.apply(this, args); };
  });
  pending = page.waitForEvent('download'); await page.locator('#share-button').click(); await pending;
  assert.ok((await page.evaluate(() => window.featureCardText)).includes('Reported listening hours'));
  assert.ok(!(await page.evaluate(() => window.featureCardText)).includes('Estimated recording royalties'));
  // Hold real PNG callbacks to reproduce lifecycle races without timing-dependent sleeps.
  await page.evaluate(() => {
    window.pendingPreviews = [];
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      return original.call(this, blob => window.pendingPreviews.push(() => callback(blob)), ...args);
    };
  });
  async function queuePreview(count) {
    await page.evaluate(() => document.querySelector('#preview-receipt').click());
    await page.waitForFunction(n => window.pendingPreviews.length === n, count);
  }
  async function flushPreview(index = 0) {
    await page.evaluate(i => window.pendingPreviews.splice(i, 1)[0](), index);
  }
  async function assertNoPreview() {
    assert.equal(await page.locator('#receipt-preview-dialog').evaluate(el => el.open), false);
    assert.equal(await page.locator('#receipt-preview-image').getAttribute('src'), null);
  }
  await queuePreview(1);
  await visitControl(page, '#quality-report');
  await flushPreview();
  await assertNoPreview();
  await visitControl(page, '#receipt-theme');
  await queuePreview(1); await queuePreview(2);
  await flushPreview(1);
  await page.waitForFunction(() => document.querySelector('#receipt-preview-image').naturalWidth === 1000);
  const latestPreview = await page.locator('#receipt-preview-image').getAttribute('src');
  await flushPreview();
  assert.equal(await page.locator('#receipt-preview-image').getAttribute('src'), latestPreview, 'Older requests cannot overwrite the newest preview');
  await queuePreview(1);
  await page.locator('#close-receipt-preview').click();
  await page.waitForFunction(() => !document.querySelector('#receipt-preview-image').hasAttribute('src'));
  await flushPreview();
  await assertNoPreview();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const control of ['#quality-report', '#receipt-theme', '#compare-file-a']) {
      await visitControl(page, control);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Feature overflow at ${width}: ${control}`);
    }
  }
  await visitControl(page, '#receipt-theme');
  await queuePreview(1);
  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(() => document.querySelector('#clear-button').click());
  await page.waitForFunction(() => document.querySelector('#stat-plays').textContent === '0');
  await flushPreview();
  await assertNoPreview();
  const offlineLastfm = sessionText({ mode: 'lastfm', selectedService: 'spotify', records: [{ source: 'lastfm', date: '2026-01-01', artist: 'Private comparison artist', track: 'Private track', ms: null, supported: true }], filters: { from: '', to: '' }, duplicates: 0, attribution: { service: 'unknown', confirmed: false, scenario: false, from: '2026-01-01', to: '2026-01-01' }, lastfm: { skipped: 0, duplicates: 0 } });
  await visitControl(page, '#restore-session');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#restore-session').setInputFiles({ name: 'offline-lastfm.json', mimeType: 'application/json', buffer: Buffer.from(offlineLastfm) });
  await page.waitForFunction(() => document.querySelector('#stat-plays').textContent === '1');
  async function selectComparison() {
    await visitControl(page, '#compare-file-a');
    for (const id of ['a', 'b']) await page.locator(`#compare-file-${id}`).setInputFiles({ name: `comparison-${id}.json`, mimeType: 'application/json', buffer: Buffer.from(offlineLastfm) });
    await page.locator('#compare-sessions').click();
  }
  async function assertComparisonCleared() {
    assert.equal(await page.locator('#download-comparison').isHidden(), true);
    assert.doesNotMatch(await page.locator('#session-comparison').textContent(), /Private comparison artist/);
    assert.deepEqual(await page.evaluate(() => ['a', 'b'].map(id => document.querySelector(`#compare-file-${id}`).files.length)), [0, 0]);
  }
  await selectComparison();
  await page.waitForFunction(() => !document.querySelector('#download-comparison').hidden);
  assert.match(await page.locator('#session-comparison').textContent(), /Private comparison artist/);
  await visitControl(page, '#clear-button');
  assert.equal(await page.locator('#download-comparison').getAttribute('hidden'), null, 'Ordinary navigation preserves the comparison');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-button').click();
  assert.equal(await page.locator('#stat-plays').textContent(), '0', 'Unavailable Last.fm cannot prevent clearing restored history');
  await assertComparisonCleared();
  await page.evaluate(() => {
    window.pendingComparisonReads = [];
    const original = File.prototype.text;
    File.prototype.text = function() {
      if (!this.name.startsWith('comparison-')) return original.call(this);
      return new Promise(resolve => window.pendingComparisonReads.push(async () => resolve(await original.call(this))));
    };
  });
  await selectComparison();
  await page.waitForFunction(() => window.pendingComparisonReads.length === 2);
  await visitControl(page, '#clear-button');
  await page.locator('#clear-button').click();
  assert.equal(await page.locator('#compare-sessions').isEnabled(), true, 'Clearing releases the lock before obsolete reads finish');
  await assertComparisonCleared();
  await selectComparison();
  await page.waitForFunction(() => window.pendingComparisonReads.length === 4);
  await page.evaluate(() => Promise.all(window.pendingComparisonReads.splice(0, 2).map(release => release())));
  // Yield through the old Promise.all/finally before checking the newer lock.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  assert.equal(await page.locator('#compare-sessions').isDisabled(), true, 'Old completion cannot unlock a newer comparison');
  await page.evaluate(() => Promise.all(window.pendingComparisonReads.splice(0).map(release => release())));
  await page.waitForFunction(() => !document.querySelector('#compare-sessions').disabled);
  assert.match(await page.locator('#session-comparison').textContent(), /Private comparison artist/);
  await selectComparison();
  await page.waitForFunction(() => window.pendingComparisonReads.length === 2);
  await page.locator('#compare-file-a').setInputFiles({ name: 'new-a.json', mimeType: 'application/json', buffer: Buffer.from(timed) });
  assert.equal(await page.locator('#compare-sessions').isEnabled(), true, 'Changing files also cancels the old logical operation');
  await page.locator('#clear-session-comparison').click();
  await page.evaluate(() => Promise.all(window.pendingComparisonReads.splice(0).map(release => release())));
  await assertComparisonCleared();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: guided CSV mapping/preview and opt-in preferences, data quality/diagnostics privacy, recap, artist observations, multiple manual artists and backup restoration, isolated local comparison, timestamp patterns, customized receipt preview/download and responsive layouts.');
} finally { await browser.close(); }