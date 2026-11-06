import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecords, summarize, manualSummary, sampleRecords, escapeHTML, RATE, mergeRecords, listeningShares } from '../lib.js';

const record = (overrides = {}) => ({ ts: '2026-05-01T23:30:00Z', ms_played: 180000, master_metadata_album_artist_name: 'An Artist', master_metadata_track_name: 'A Track', spotify_track_uri: 'spotify:track:123', ...overrides });

test('normalizes extended-history fields without retaining account identifiers', () => {
  const [r] = normalizeRecords([record({ username: 'private-name', ip_addr: '127.0.0.1' })]);
  assert.equal(r.date, '2026-05-01'); assert.equal(r.artist, 'An Artist'); assert.equal(r.ms, 180000);
  assert.equal(r.supported, true); assert.ok(r.eventKey);
  assert.ok(!JSON.stringify(r).includes('private-name')); assert.ok(!JSON.stringify(r).includes('127.0.0.1'));
});
test('includes exactly 30 seconds but excludes shorter plays', () => {
  const s = summarize(normalizeRecords([record({ ms_played: 30000 }), record({ ms_played: 29999 })]));
  assert.equal(s.plays, 1); assert.equal(s.audit.short, 1); assert.equal(s.amount, RATE);
});
test('audits unsupported, missing metadata, invalid dates and durations', () => {
  const s = summarize(normalizeRecords([record({ spotify_track_uri: null }), record({ master_metadata_track_name: null }), record({ ts: 'oops' }), record({ ms_played: -1 }), null, record({ ms_played: '30000' })]));
  assert.equal(s.audit.unsupported, 2); assert.equal(s.audit.invalid, 4); assert.equal(s.plays, 0);
});
test('Spotify timestamps reject impossible source components before UTC normalization', () => {
  const invalid = ['2026-02-30T23:00:00Z', '2026-02-29T00:00:00+02:00', '2024-04-31T12:00:00-02:00',
    '2026-01-01T24:00:00Z', '2026-01-01T23:60:00Z', '2026-01-01T23:00:60Z',
    '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00+01:60', '2026-01-01', 'January 1, 2026'];
  const records = normalizeRecords(invalid.map(ts => record({ ts })));
  assert.deepEqual(records, invalid.map(() => ({ invalid: true })));
  assert.equal(summarize(records).audit.invalid, invalid.length);
  const valid = normalizeRecords(['2024-02-29T23:30:00.12-02:00', '2026-01-01T00:30:00.1+02:00', '2026-01-01T00:00:00.123Z'].map(ts => record({ ts })));
  assert.deepEqual(valid.map(r => r.timestamp), ['2024-03-01T01:30:00.120Z', '2025-12-31T22:30:00.100Z', '2026-01-01T00:00:00.123Z']);
  assert.deepEqual(valid.map(r => r.date), ['2024-03-01', '2025-12-31', '2026-01-01']);
});
test('date filters are inclusive and UTC-based', () => {
  const records = normalizeRecords([record({ ts: '2026-05-01T23:30:00-02:00' }), record({ ts: '2026-05-01T00:00:00Z' }), record({ ts: '2026-05-03T00:00:00Z' })]);
  const s = summarize(records, { from: '2026-05-02', to: '2026-05-02' });
  assert.equal(s.plays, 1); assert.equal(s.audit.outside, 2);
});
test('aggregates artist and track counts deterministically', () => {
  const s = summarize(normalizeRecords([record(), record(), record({ master_metadata_album_artist_name: 'Zed' })]));
  assert.equal(s.artists[0].name, 'An Artist'); assert.equal(s.artists[0].tracks.get('A Track'), 2); assert.equal(s.ms, 540000);
});
test('rejects unsupported file shapes and standard account export', () => {
  for (const data of [{}, [], [{ endTime: '2026-05-01', msPlayed: 30000 }]]) assert.throws(() => normalizeRecords(data));
});
test('manual entry validates boundaries and never invents duration', () => {
  const s = manualSummary('  Artist  ', 1000); assert.equal(s.amount, 3); assert.equal(s.ms, null); assert.equal(s.artists[0].name, 'Artist');
  for (const count of [0, -1, 1.5, NaN, Infinity, 10000001]) assert.throws(() => manualSummary('Artist', count));
  assert.throws(() => manualSummary(' ', 1)); assert.throws(() => manualSummary('a'.repeat(101), 1));
});
test('sample data is deterministic and exclusions reconcile', () => {
  const records = sampleRecords(), s = summarize(records);
  assert.deepEqual(records, sampleRecords()); assert.equal(s.plays, 2727); assert.equal(s.artists.length, 6);
  assert.equal(s.audit.short, 93); assert.equal(s.audit.unsupported, 18);
  assert.equal(Object.values(s.audit).reduce((a, b) => a + b, 0), records.length);
});
test('escapes imported content before HTML rendering', () => {
  assert.equal(escapeHTML('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
});

test('deduplication preserves occurrences within a file and removes cross-file overlap', () => {
  const existing = [], counts = new Map();
  const first = normalizeRecords([record(), record()]);
  assert.deepEqual(mergeRecords(existing, first, counts), { added: 2, duplicates: 0 });
  assert.deepEqual(mergeRecords(existing, normalizeRecords([record(), record(), record()]), counts), { added: 1, duplicates: 2 });
  assert.deepEqual(mergeRecords(existing, first, counts), { added: 0, duplicates: 2 });
  assert.equal(existing.length, 3);
});
test('deduplication retains same-day different timestamps and different tracks', () => {
  const existing = [], counts = new Map();
  mergeRecords(existing, normalizeRecords([record()]), counts);
  const merged = mergeRecords(existing, normalizeRecords([record({ ts: '2026-05-01T23:31:00Z' }), record({ spotify_track_uri: 'spotify:track:other' })]), counts);
  assert.equal(merged.added, 2); assert.equal(existing.length, 3);
});
test('monthly counts and hours reconcile with selected totals', () => {
  const s = summarize(normalizeRecords([record(), record({ ts: '2026-06-01T00:00:00Z' }), record({ ms_played: 1 })]));
  assert.deepEqual(s.months.map(m => m.month), ['2026-05', '2026-06']);
  assert.equal(s.months.reduce((sum, m) => sum + m.plays, 0), s.plays);
  assert.equal(s.months.reduce((sum, m) => sum + m.ms, 0), s.ms);
  assert.equal(summarize(normalizeRecords([record()]), { from: '2026-06-01' }).months.length, 0);
});
test('unknown durations affect only their own artist and month, not complete groups', () => {
  const row = (date, artist, ms) => ({ source: 'csv', date, artist, track: 'Track', supported: true, ms });
  const rows = [row('2026-01-01', 'Known', 3600000), row('2026-02-01', 'Mixed', null),
    row('2026-02-02', 'Mixed', 3600000), row('2026-03-01', 'Mixed', 3600000), row('2026-04-01', 'Later unknown', 3600000), row('2026-04-02', 'Later unknown', null)];
  const result = summarize(rows);
  assert.equal(result.ms, null);
  assert.equal(result.artists.find(a => a.name === 'Known').ms, 3600000);
  assert.equal(result.artists.find(a => a.name === 'Mixed').ms, null);
  assert.equal(result.artists.find(a => a.name === 'Later unknown').ms, null);
  assert.deepEqual(result.months.map(m => m.ms), [3600000, null, 3600000, null]);
  assert.equal(summarize(rows, { to: '2026-01-31' }).ms, 3600000);
  const lastfm = summarize(rows.map(r => ({ ...r, source: 'lastfm', ms: null })));
  assert.equal(lastfm.ms, null);
  assert.ok(lastfm.artists.every(a => a.ms === null));
  assert.ok(lastfm.months.every(m => m.ms === null));
});

test('listening shares include an other bucket and reconcile to 100%', () => {
  const s = summarize(sampleRecords()); const shares = listeningShares(s.artists, s.plays);
  assert.equal(shares.length, 6); assert.equal(shares[5].name, 'Other artists');
  assert.ok(Math.abs(shares.reduce((sum, a) => sum + a.percent, 0) - 100) < 0.00001);
  assert.deepEqual(listeningShares([], 0), []);
});