import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityReport, recap, artistDetails, listeningPatterns, compareSessions, safeDiagnostics } from '../explore.js';
import { manualArtistsSummary, normalizeRecords, summarize } from '../lib.js';
import { sessionText, parseSession } from '../session.js';
import { runImport } from '../import-job.js';
import { encodeCloud, decodeCloud } from '../cloud.js';

const row = (date, extra = {}) => ({ date, artist: 'Artist', track: 'Song', ms: 60000, supported: true, ...extra });
const state = (records, extra = {}) => ({ mode: 'import', selectedService: 'spotify', records, filters: { from: '', to: '' }, duplicates: 0, ...extra });

test('manual artist rows combine exact names, validate totals and round trip without invented metadata', () => {
  const entries = [{ artist: ' A ', plays: 3 }, { artist: 'B', plays: 7 }, { artist: 'A', plays: 2 }];
  const summary = manualArtistsSummary(entries);
  assert.equal(summary.plays, 12); assert.equal(summary.ms, null);
  assert.deepEqual(summary.artists.map(a => [a.name, a.plays, a.tracks.size]), [['B', 7, 0], ['A', 5, 0]]);
  const text = sessionText(state([], { mode: 'manual', selectedService: 'apple', manual: { artists: entries } }));
  assert.equal(JSON.parse(text).version, 2);
  const restored = parseSession(text);
  assert.equal(restored.manual.artists.length, 2); assert.equal(restored.manual.amount, null);
  const encoded = encodeCloud(text);
  assert.equal(decodeCloud({ schema: 1, version: 1, deleted: false, chunks: encoded.chunks.length, bytes: encoded.bytes }, encoded.chunks.map(data => ({ version: 1, data }))), text);
  assert.equal(parseSession(sessionText(state([], { mode: 'manual', manual: { artist: 'Legacy', plays: 1 } }))).manual.plays, 1);
  for (const invalid of [[], Array(101).fill({ artist: 'A', plays: 1 }), [{ artist: 'A', plays: 0 }], [{ artist: 'A', plays: 1.5 }], [{ artist: 'A', plays: 10000000 }, { artist: 'B', plays: 1 }]]) assert.throws(() => manualArtistsSummary(invalid));
});

test('precise Spotify timestamps survive local sessions and invalid timestamp/date combinations are rejected', () => {
  const records = normalizeRecords([{ ts: '2026-01-01T02:00:00+02:00', ms_played: 60000, master_metadata_album_artist_name: 'A', master_metadata_track_name: 'T', spotify_track_uri: 'spotify:track:x' }]);
  assert.equal(records[0].timestamp, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(parseSession(sessionText(state(records))).records, records);
  assert.throws(() => sessionText(state([row('2026-01-02', { timestamp: '2026-01-01T00:00:00.000Z' })])));
  assert.throws(() => sessionText(state([row('2026-01-01', { timestamp: 'not a timestamp' })])));
});

test('quality and recaps respect exclusions, unknown durations and selected dates', () => {
  const records = [row('2026-01-01'), row('2026-01-02', { source: 'csv', ms: null }), row('2026-01-03', { ms: 100 }), row('2026-01-04', { supported: false }), { invalid: true }, row('2025-01-01')];
  const q = qualityReport(records, { from: '2026-01-01' }, 2);
  assert.equal(q.included, 2); assert.equal(q.short, 1); assert.equal(q.unsupported, 1); assert.equal(q.invalid, 1); assert.equal(q.outside, 1);
  assert.equal(q.knownDuration, 1); assert.equal(q.unknownDuration, 1); assert.equal(q.duplicates, 2);
  const r = recap(summarize(records, { from: '2026-01-01' }));
  assert.equal(r.hours, null); assert.equal(r.topTracks[0].plays, 2); assert.equal(r.concentration, 100);
});

test('patterns use only validated timestamps and UTC, never inferred hours from dates', () => {
  const records = [row('2026-01-01', { timestamp: '2026-01-01T23:00:00.000Z' }), row('2026-01-02', { timestamp: '2026-01-02T00:00:00.000Z' }), row('2026-01-03'), row('2026-01-04', { timestamp: 'bad' }), row('2026-01-05', { timestamp: '2026-01-05T01:00:00.000Z', ms: 100 })];
  const p = listeningPatterns(records);
  assert.equal(p.timed, 2); assert.equal(p.included, 4); assert.equal(p.hours[23], 1); assert.equal(p.hours[0], 1); assert.equal(p.longest, 2);
  assert.equal(listeningPatterns([row('2026-01-01')]).timed, 0);
  assert.equal(listeningPatterns(records, { from: '2026-01-02', to: '2026-01-02' }).longest, 1);
});

test('artist deep dives report observed dates and filtered monthly totals', () => {
  const detail = artistDetails([row('2026-01-01'), row('2026-02-01'), row('2026-02-02', { artist: 'Other' })], 'Artist', { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(detail.first, '2026-02-01'); assert.equal(detail.last, '2026-02-01'); assert.equal(detail.months[0].plays, 1);
  assert.equal(detail.tracks[0].title, 'Song');
});

test('local session comparison preserves inputs, matches exact names and remains unpriced', () => {
  const left = parseSession(sessionText(state([row('2026-01-01'), row('2026-01-02')])));
  const right = parseSession(sessionText(state([row('2026-01-01'), row('2026-01-02', { artist: 'Other' })])));
  const before = JSON.stringify([left, right]);
  const comparison = compareSessions(left, right);
  assert.equal(comparison.sharedArtists, 1); assert.equal(comparison.sharedTracks, 1);
  assert.equal(comparison.changes.find(a => a.name === 'Artist').delta, -50);
  assert.equal(comparison.left.plays, 2); assert.equal(comparison.left.amount, undefined);
  assert.equal(JSON.stringify([left, right]), before);
});

test('Last.fm comparison duration stays unknown for empty and filtered-out histories', () => {
  const base = { mode: 'lastfm', selectedService: 'spotify', filters: { from: '', to: '' }, duplicates: 0,
    attribution: { service: 'unknown', confirmed: false, scenario: false, from: '2026-01-01', to: '2026-01-31' }, lastfm: { skipped: 0, duplicates: 0 } };
  const empty = parseSession(sessionText({ ...base, records: [] }));
  const filtered = parseSession(sessionText({ ...base, records: [row('2026-01-01', { source: 'lastfm', ms: null })], filters: { from: '2026-01-02', to: '2026-01-31' } }));
  const result = compareSessions(empty, filtered);
  assert.equal(result.left.plays, 0); assert.equal(result.right.plays, 0);
  assert.equal(result.left.hours, null); assert.equal(result.right.hours, null);
  const spotify = parseSession(sessionText(state([])));
  assert.equal(compareSessions(spotify, empty).left.hours, 0);
});

test('CSV file deduplication respects effective mapping and still deduplicates events', async () => {
  const file = new File(['date,artist,track,alternate,ms_played\n2026-01-01,Artist,Track A,Track B,60000'], 'history.csv');
  const mapping = { date: 'date', artist: 'artist', track: 'track', ms: 'ms_played' };
  const first = await runImport([file], { ...state([]), csv: true });
  const same = await runImport([file], { ...first, csv: true, mapping: { ms: 'ms_played', track: 'track', artist: 'artist', date: 'date' } });
  assert.equal(same.previews[0].status, 'duplicate file');
  const changed = await runImport([file], { ...same, csv: true, mapping: { ...mapping, track: 'alternate' } });
  assert.equal(changed.previews[0].status, 'accepted');
  assert.deepEqual(changed.records.map(r => r.track), ['Track A', 'Track B']);
  const overlap = new File(['date,artist,track,alternate,ms_played\n2026-01-01,Artist,Track A,Track B,60000\n2026-01-02,Artist,Track C,Track D,60000'], 'overlap.csv');
  const appended = await runImport([overlap], { ...changed, csv: true, mapping });
  assert.equal(appended.previews[0].duplicates, 1);
  assert.equal(appended.records.length, 3);
  const unknown = await runImport([file], { ...first, csv: true, mapping: { ...mapping, ms: '' } });
  assert.equal(unknown.previews[0].status, 'accepted');
  assert.equal(unknown.records.at(-1).ms, null);
});

test('diagnostics omit metadata and raw records; import reports distinguish accepted and failed files', async () => {
  const input = state([]);
  const imported = await runImport([new File(['date,artist,track,ms_played\n2026-01-01,Private Artist,Secret Track,100\n2026-01-02,Private Artist,Secret Track,60000'], 'private.csv'), new File(['bad'], 'secret.csv')], { ...input, csv: true });
  assert.equal(imported.previews[0].short, 1); assert.equal(imported.previews[1].status, 'rejected');
  const output = JSON.stringify(safeDiagnostics(qualityReport(imported.records), imported.previews));
  assert.doesNotMatch(output, /private\.csv|secret\.csv|Private Artist|Secret Track|eventKey|timestamp/);
  assert.equal(JSON.parse(output).files[0].short, 1);
  assert.doesNotMatch(JSON.stringify(safeDiagnostics({ ...qualityReport(imported.records), secret: 'private metadata' }, [{ name: 'private', status: 'private metadata' }])), /private/);
});