// Optional browser harness: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeZip } from './zip-fixture.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
  page.on('request', r => { if (!r.url().startsWith(`${base}/`)) external.push(r.url()); });
  await page.goto(base);
  assert.match(await page.title(), /Payola Draft/);
  assert.equal(await page.locator('#stat-plays').textContent(), '2,727');
  await page.locator('[data-preset="month"]').click();
  assert.equal(await page.locator('#from-date').inputValue(), '2026-10-01');
  await page.locator('#compare-toggle').check();
  assert.match(await page.locator('#comparison').textContent(), /Equal-length windows: 31 days/);
  await page.locator('#year-preset').selectOption('2026');
  assert.match(await page.locator('#comparison').textContent(), /outside the observed/);
  await page.locator('[data-preset="all"]').click();
  let pending = page.waitForEvent('download'); await page.locator('#export-csv').click();
  const csvDownload = await pending;
  assert.equal(csvDownload.suggestedFilename(), 'payola-draft-summary-sample.csv');
  const csv = await readFile(await csvDownload.path(), 'utf8');
  assert.match(csv, /Fictional sample/); assert.match(csv, /not confirmed earnings/); assert.match(csv, /Luna Vale/);
  await page.locator('[data-mode="import"]').click();
  const raw = { ts: '2026-05-01T00:00:00Z', ms_played: 60000, master_metadata_album_artist_name: 'Test Artist', master_metadata_track_name: 'Track', spotify_track_uri: 'spotify:track:123' };
  const data = JSON.stringify([raw, { ...raw, ts: '2026-06-01T00:00:00Z' }]);
  const zip = makeZip({ 'history.json': data });
  await page.locator('#history-files').setInputFiles({ name: 'history.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await page.waitForFunction(() => document.querySelector('#stat-plays').textContent === '2');
  assert.match(await page.locator('#import-summary').textContent(), /2 records retained/);
  // Hold a second worker deterministically so cancellation cannot race a fast import.
  await page.evaluate(() => { window.RealWorker = window.Worker; window.Worker = class extends window.RealWorker { postMessage() {} }; });
  await page.locator('#history-files').setInputFiles({ name: 'cancel.json', mimeType: 'application/json', buffer: Buffer.from(data) });
  await page.locator('#cancel-import').click();
  assert.equal(await page.locator('#stat-plays').textContent(), '2');
  assert.match(await page.locator('#import-feedback').textContent(), /previously imported history is unchanged/);
  await page.evaluate(() => { window.Worker = window.RealWorker; });
  await page.locator('#history-files').setInputFiles({ name: 'renamed.json', mimeType: 'application/json', buffer: Buffer.from(data) });
  await page.waitForFunction(() => document.querySelector('#import-feedback').textContent.includes('identical file contents'));
  assert.equal(await page.locator('#stat-plays').textContent(), '2');
  await page.locator('[data-mode="manual"]').click();
  assert.equal(await page.locator('#period-controls').isVisible(), false);
  await page.locator('[name="artist"]').fill('=SUM(A1)'); await page.locator('[name="plays"]').fill('1000'); await page.locator('#manual-form button').click();
  pending = page.waitForEvent('download'); await page.locator('#export-csv').click();
  const manualCSV = await readFile(await (await pending).path(), 'utf8');
  assert.ok(manualCSV.includes('"\'=SUM(A1)"')); assert.match(manualCSV, /Self-reported/);
  await page.locator('.artist-button').first().click();
  pending = page.waitForEvent('download'); await page.locator('#artist-download').click();
  assert.equal((await pending).suggestedFilename(), 'payola-draft-artist-listening-manual.png');
  await page.keyboard.press('Escape');
  await page.locator('[data-mode="sample"]').click();
  await page.locator('#compare-toggle').check();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  // Last.fm API fixtures: no real username, key, or third-party request required.
  await page.locator('[data-mode="lastfm"]').click();
  await page.locator('#lastfm-user').fill('test-user');
  await page.locator('#lastfm-form [name="from"]').fill('2026-01-01');
  await page.locator('#lastfm-form [name="to"]').fill('2026-02-28');
  let fail = false, slow = false;
  await page.route('**/api/lastfm?*', async route => {
    if (slow) await new Promise(resolve => setTimeout(resolve, 1200));
    if (fail) { await route.fulfill({ status: 503, json: { error: 'Last.fm is not configured.' } }); return; }
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
    await route.fulfill({ json: { page: pageNumber, totalPages: 2, skipped: 0, records: [{ source: 'lastfm', date: pageNumber === 1 ? '2026-02-01' : '2026-01-01', artist: 'Scrobble Artist', track: 'Song', ms: null, supported: true, eventKey: `scrobble-${pageNumber}` }] } });
  });
  await page.locator('#remember-lastfm').check();
  await page.locator('#lastfm-form [type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#lastfm-status').textContent.includes('Loaded 2 scrobbles'));
  assert.equal(await page.locator('#stat-hours').textContent(), '—');
  assert.equal(await page.locator('#receipt-total').textContent(), '2');
  assert.equal(await page.locator('#artist-rows tr td:last-child').textContent(), '—');
  assert.equal(await page.locator('.assumptions-card').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('payola-lastfm-user')), 'test-user');
  pending = page.waitForEvent('download'); await page.locator('#export-csv').click();
  const scrobbleCSV = await readFile(await (await pending).path(), 'utf8');
  assert.match(scrobbleCSV, /recorded_scrobbles/); assert.doesNotMatch(scrobbleCSV, /Duetti Spotify sample/);
  await page.locator('.artist-button').first().click();
  assert.equal(await page.locator('#artist-card-style option').count(), 1);
  assert.match(await page.locator('#artist-detail .detail-total').textContent(), /2 scrobbles/);
  await page.keyboard.press('Escape');
  await page.locator('#lastfm-service').selectOption('spotify');
  assert.equal(await page.locator('#lastfm-scenario').isDisabled(), true);
  await page.locator('#lastfm-confirm').check();
  await page.locator('#lastfm-scenario').check();
  assert.equal(await page.locator('#receipt-total').textContent(), '2');
  await page.locator('#lastfm-form [type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#receipt-total').textContent === '$0.01');
  assert.match(await page.locator('#receipt .receipt-amount-label').textContent(), /Hypothetical/);
  await page.locator('#artist-search').fill('Scrobble');
  assert.equal(await page.locator('#artist-rows tr td:last-child').textContent(), '$0.01');
  pending = page.waitForEvent('download'); await page.locator('#export-csv').click();
  assert.match(await readFile(await (await pending).path(), 'utf8'), /hypothetical_spotify_benchmark_scenario_usd/);
  await page.locator('#lastfm-form [name="from"]').fill('2026-01-02');
  await page.locator('#lastfm-form [name="from"]').blur();
  assert.equal(await page.locator('#lastfm-confirm').isChecked(), false);
  assert.equal(await page.locator('#lastfm-scenario').isChecked(), false);
  assert.equal(await page.locator('#receipt-total').textContent(), '$0.01');
  await page.locator('#lastfm-form [name="from"]').fill('2026-01-01');
  await page.locator('#lastfm-service').selectOption('unknown');
  assert.equal(await page.locator('#lastfm-scenario').isChecked(), false);
  await page.locator('#lastfm-form [type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#receipt-total').textContent === '2');
  fail = true; await page.locator('#lastfm-form [type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#lastfm-status').textContent.includes('not configured'));
  assert.equal(await page.locator('#stat-plays').textContent(), '2');
  fail = false; slow = true; await page.locator('#lastfm-form [type="submit"]').click(); await page.locator('#cancel-lastfm').click();
  await page.waitForFunction(() => document.querySelector('#lastfm-status').textContent.includes('cancelled'));
  assert.equal(await page.locator('#stat-plays').textContent(), '2');
  await page.locator('#forget-lastfm').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('payola-lastfm-user')), null);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Last.fm overflow at ${width}`);
  }
  await page.locator('[data-mode="sample"]').click();
  assert.equal(await page.locator('#receipt-total').textContent(), '$8.18');
  assert.equal(await page.locator('.assumptions-card').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: Last.fm pagination, scrobble-only labels, absent duration and royalties, CSV, artist card restrictions, refresh failure preservation, cancel, remember/forget, 4 widths, Spotify regression.');
  for (const service of ['apple', 'youtube']) {
    await page.locator('#service-picker').selectOption(service);
    assert.equal(await page.locator('[data-mode="import"]').isVisible(), false);
    assert.equal(await page.locator('#lastfm-service').inputValue(), service);
    assert.equal(await page.locator('#lastfm-confirm').isChecked(), false);
    await page.locator('[data-mode="manual"]').click();
    await page.locator('[name="artist"]').fill('Manual Artist');
    await page.locator('[name="plays"]').fill('1000');
    await page.locator('#manual-form button').click();
    assert.equal(await page.locator('#receipt-total').textContent(), '1,000');
    assert.equal(await page.locator('#artist-rows tr td:last-child').textContent(), '—');
    pending = page.waitForEvent('download'); await page.locator('#export-csv').click();
    assert.doesNotMatch(await readFile(await (await pending).path(), 'utf8'), /Duetti Spotify sample/);
    await page.locator('.artist-button').first().click();
    assert.equal(await page.locator('#artist-card-style option').count(), 1);
    await page.keyboard.press('Escape');
  }
  await page.locator('#service-picker').selectOption('spotify');
  assert.equal(await page.locator('[data-mode="import"]').isVisible(), true);
  console.log('PASS: service-first routes, separate Last.fm declaration, non-Spotify manual counts and unpriced exports.');
  await page.goto(`${base}/apple.html`);
  assert.match(await page.title(), /Apple Music preview/);
  // SDK stub exercises app authorization/data boundaries without real Apple credentials.
  await page.evaluate(() => {
    window.MusicKit = { configure: async () => {}, getInstance: () => ({ authorize: async () => 'mock-user-token', unauthorize: async () => {} }) };
  });
  await page.route('**/api/apple/config', route => route.fulfill({ json: { developerToken: 'mock-developer-token' } }));
  let appleCalls = 0;
  await page.route('https://api.music.apple.com/**', route => {
    appleCalls++;
    assert.equal(route.request().headers()['music-user-token'], 'mock-user-token');
    return route.fulfill({ json: { data: [{ id: 'song', type: 'songs', attributes: { name: '<img src=x>', artistName: 'Apple Artist', albumName: 'Album' } }], ...(appleCalls === 1 ? { next: '/v1/me/recent/played/tracks?offset=10' } : {}) } });
  });
  assert.equal(appleCalls, 0);
  await page.locator('#apple-prepare').click();
  await page.locator('#apple-authorize').click();
  await page.waitForFunction(() => document.querySelector('#apple-items').children.length === 1);
  assert.equal(await page.locator('#apple-items img').count(), 0);
  assert.match(await page.locator('#apple-summary').textContent(), /Not a play count/);
  await page.locator('#apple-more').click();
  await page.waitForFunction(() => document.querySelector('#apple-items').children.length === 2);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Apple preview overflow at ${width}`);
  }
  await page.locator('#apple-disconnect').click();
  assert.equal(await page.locator('#apple-items tr').count(), 0);
  assert.equal(await page.locator('#apple-refresh').isVisible(), false);
  await page.unroute('**/api/apple/config');
  await page.route('**/api/apple/config', route => route.fulfill({ status: 503, json: { error: 'Apple Music is not configured.' } }));
  await page.locator('#apple-prepare').click();
  await page.waitForFunction(() => document.querySelector('#apple-status').textContent.includes('not configured'));
  assert.deepEqual(errors, []);
  console.log('PASS: Apple preview explicit connection, mocked authorization, direct API headers, safe rendering, pagination, no play/royalty claims, disconnect, missing configuration and responsive layouts.');
  console.log('PASS: presets, comparisons, CSV metadata and formula safety, real worker ZIP import, cancellation preservation, dedup, manual mode, artist PNG, responsive widths, no errors/external requests.');
} finally { await browser.close(); }