import test from 'node:test';
import assert from 'node:assert/strict';
import { runImport, MAX_RECORDS, MAX_SESSION_BYTES } from '../import-job.js';
const raw = { ts: '2026-01-01T00:00:00Z', ms_played: 60000, master_metadata_album_artist_name: 'Artist', master_metadata_track_name: 'Track', spotify_track_uri: 'spotify:track:123' };
const file = (items, name = 'history.json') => new File([JSON.stringify(items)], name);
const state = () => ({ records: [], hashes: new Set(), occurrences: new Map(), bytes: 0, duplicates: 0 });
test('import job reports stages and leaves its input untouched', async () => {
  const s = state(), stages = [];
  const result = await runImport([file([raw])], s, p => stages.push(p.stage));
  assert.equal(s.records.length, 0); assert.equal(s.hashes.size, 0); assert.equal(s.occurrences.size, 0);
  assert.equal(result.records.length, 1); assert.ok(result.bytes > 0); assert.ok(stages.some(s => s.includes('Parsing')));
  const again = await runImport([file([raw], 'renamed.json')], result);
  assert.equal(again.records.length, 1); assert.match(again.messages[0], /identical/);
});
test('resource failures preserve previous state and do not register failed hashes', async () => {
  const s = state(); s.bytes = MAX_SESSION_BYTES;
  const result = await runImport([file([raw])], s);
  assert.equal(result.records.length, 0); assert.equal(result.hashes.size, 0); assert.match(result.messages[0], /Session limit/);
  const limited = state(); limited.records = Array(MAX_RECORDS).fill({ invalid: true });
  const over = await runImport([file([raw])], limited);
  assert.equal(over.records.length, MAX_RECORDS); assert.equal(over.occurrences.size, 0); assert.equal(over.hashes.size, 0);
});
test('malformed files do not block later valid files', async () => {
  const result = await runImport([new File(['oops'], 'bad.json'), file([raw])], state());
  assert.equal(result.records.length, 1); assert.match(result.messages[0], /Invalid JSON/);
});