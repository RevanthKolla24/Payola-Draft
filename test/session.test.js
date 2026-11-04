import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionText, parseSession, MAX_SESSION_FILE_BYTES } from '../session.js';
import { sampleRecords, summarize } from '../lib.js';
import { attribution } from '../attribution.js';
import { listeningInsights } from '../insights.js';

const state = () => ({ mode: 'sample', selectedService: 'spotify', records: sampleRecords(), filters: { from: '', to: '' }, duplicates: 0 });
test('local sessions round trip records, filters and benchmark metadata', () => {
  const original = state(); original.filters.from = '2026-02-01';
  const output = sessionText(original), restored = parseSession(output);
  assert.deepEqual(summarize(restored.records), summarize(original.records));
  assert.deepEqual(restored.filters, original.filters);
  assert.equal(summarize(restored.records).plays, 2727);
  assert.match(output, /Duetti Spotify sample/);
});
test('restored Last.fm preserves declaration period and unknown duration, disables scenario', () => {
  const input = { ...state(), mode: 'lastfm', attribution: { ...attribution('spotify', true, true), from: '2026-01-01', to: '2026-02-28' }, lastfm: { skipped: 2, duplicates: 1 }, records: [{ source: 'lastfm', date: '2026-02-01', artist: 'Artist', track: 'Track', supported: true, ms: null }] };
  const restored = parseSession(sessionText(input));
  assert.equal(restored.attribution.scenario, false);
  assert.equal(restored.attribution.confirmed, true);
  assert.equal(restored.attribution.from, '2026-01-01');
  assert.equal(summarize(restored.records).ms, null);
  input.records[0].ms = 1000;
  assert.throws(() => sessionText(input), /Invalid/);
});
test('manual non-Spotify sessions stay unpriced and never invent tracks', () => {
  const restored = parseSession(sessionText({ ...state(), mode: 'manual', selectedService: 'apple', records: [], manual: { artist: 'A', plays: 12 } }));
  assert.equal(restored.manual.amount, null);
  assert.equal(restored.manual.ms, null);
  assert.equal(restored.manual.artists[0].tracks.size, 0);
});
test('rejects malformed, oversized, unsupported and inconsistent sessions', () => {
  assert.throws(() => parseSession('{'), /JSON/);
  assert.throws(() => parseSession(' '.repeat(MAX_SESSION_FILE_BYTES + 1)), /25 MB/);
  const valid = JSON.parse(sessionText(state()));
  for (const patch of [{ version: 2 }, { mode: 'unknown' }, { selectedService: 'apple' }, { records: Array(200001).fill({ invalid: true }) }, { filters: { from: '2026-02-30', to: '' } }, { duplicates: -1 }, { benchmark: { usdPerPlay: 1 } }, { records: [{ source: 'lastfm', date: '2026-01-01', artist: 'A', track: 'T', supported: true, ms: null }] }]) {
    assert.throws(() => parseSession(JSON.stringify({ ...valid, ...patch })));
  }
});
test('restores only known fields and keeps malicious metadata as inert text', () => {
  const input = state(); input.records = [{ date: '2026-01-01', ms: 30000, supported: true, artist: '<img src=x>', track: '=SUM(A1)', secret: 'discard' }];
  const restored = parseSession(sessionText(input));
  assert.equal(restored.records[0].secret, undefined);
  assert.equal(restored.records[0].artist, '<img src=x>');
});
test('top tracks and concentration follow summary filters with deterministic artist/title identities', () => {
  const records = [{ date: '2026-01-01', ms: 30000, supported: true, artist: 'A', track: 'Same' }, { date: '2026-02-01', ms: 30000, supported: true, artist: 'B', track: 'Same' }];
  assert.equal(listeningInsights(summarize(records)).tracks.length, 2);
  const insights = listeningInsights(summarize(records, { from: '2026-02-01' }));
  assert.equal(insights.tracks[0].artist, 'B');
  assert.equal(insights.concentration, 100);
  assert.equal(listeningInsights(summarize([])).concentration, null);
});