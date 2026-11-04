import test from 'node:test';
import assert from 'node:assert/strict';
import { attribution, attributionText } from '../attribution.js';
import { summaryCSV } from '../reports.js';

test('single-service attribution requires whole-period confirmation', () => {
  for (const service of ['spotify', 'apple', 'youtube', 'other']) {
    assert.throws(() => attribution(service), /Confirm/);
    assert.equal(attribution(service, true).confirmed, true);
  }
  assert.throws(() => attribution('invalid'), /supported/);
});
test('mixed histories and non-Spotify histories never enable scenarios', () => {
  for (const service of ['unknown', 'apple', 'youtube', 'other']) {
    assert.equal(attribution(service, true, true).scenario, false);
  }
  assert.match(attributionText(attribution()), /unknown/);
  assert.equal(attribution('spotify', true, true).scenario, true);
});
test('original declaration dates remain distinct from display filter dates in labels and CSV', () => {
  const declaration = { ...attribution('spotify', true, true), from: '2026-01-01', to: '2026-02-28' };
  assert.match(attributionText(declaration), /2026-01-01 – 2026-02-28 UTC/);
  const csv = summaryCSV({ plays: 1, amount: null, ms: null, artists: [] }, {
    source: 'Last.fm recorded scrobbles', from: '2026-02-01', to: '2026-02-02', attribution: declaration,
  });
  assert.match(csv, /original_request_from_utc/);
  assert.match(csv, /"2026-02-01","2026-02-02"/);
  assert.match(csv, /"2026-01-01","2026-02-28"/);
  assert.equal(declaration.from, '2026-01-01');
});
test('CSV distinguishes scenarios from unpriced scrobbles and manual counts', () => {
  const summary = { plays: 10, amount: null, ms: null, artists: [] };
  const mixed = summaryCSV(summary, { source: 'Last.fm recorded scrobbles', attribution: attribution() });
  assert.doesNotMatch(mixed, /Duetti Spotify sample/);
  assert.match(mixed, /No royalty estimate/);
  const scenario = summaryCSV(summary, { source: 'Last.fm recorded scrobbles', attribution: attribution('spotify', true, true) });
  assert.match(scenario, /hypothetical_spotify_benchmark_scenario_usd/);
  assert.match(scenario, /self-reported, not verified/);
  assert.match(scenario, /0.030000/);
  const manual = summaryCSV(summary, { source: 'Self-reported Apple Music' });
  assert.doesNotMatch(manual, /Duetti Spotify sample|recorded_scrobbles/);
  assert.match(manual, /No validated service benchmark/);
});