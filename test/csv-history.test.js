import test from 'node:test';
import assert from 'node:assert/strict';
import { csvRows, normalizeCSV } from '../csv-history.js';
import { summarize } from '../lib.js';
import { runImport } from '../import-job.js';
import { sessionText, parseSession } from '../session.js';
import { summaryCSV } from '../reports.js';
import { encodeCloud, decodeCloud } from '../cloud.js';
const csv = 'date,artist,track,ms_played\r\n2026-01-01,"Artist, A","Track ""One""",60000\r\n2026-01-02,B,Unknown,\r\n2026-01-03,B,Short,5000';
const empty = () => ({ records: [], hashes: new Set(), occurrences: new Map(), bytes: 0, duplicates: 0, csv: true });
test('CSV quoted metadata, BOM, CRLF and missing duration remain unpriced', () => {
  const records = normalizeCSV('\uFEFF' + csv), result = summarize(records);
  assert.equal(records[0].artist, 'Artist, A'); assert.equal(records[0].track, 'Track "One"');
  assert.equal(records[1].ms, null); assert.equal(result.ms, null); assert.equal(result.amount, null);
  assert.equal(result.plays, 2); assert.equal(result.audit.short, 1);
  const output = summaryCSV(result, { source: 'User-provided CSV history' });
  assert.doesNotMatch(output, /Duetti Spotify sample/);
});
test('CSV malformed quoting, row widths, duplicate headers and libraries are rejected', () => {
  for (const text of ['a,a\n1,2', 'a,b\n1', 'a,b\n"open,2', 'a,b\n"x"oops,2', 'artist,track\nA,T']) {
    assert.throws(() => normalizeCSV(text));
  }
  assert.equal(csvRows('a,b\n"line\nbreak",2').rows[0][0], 'line\nbreak');
  assert.throws(() => csvRows('a,b\n1,2,3'));
  assert.throws(() => csvRows(Array(101).fill('header').join(',') + '\n' + Array(101).fill('value').join(',')), /100 columns/);
});
test('CSV explicit mapping validates dates, durations and separate fields', () => {
  const mapping = { date: 'Day', artist: 'Who', track: 'Song', ms: '' };
  assert.equal(normalizeCSV('Day,Who,Song\n2026-02-01,A,T', mapping)[0].ms, null);
  assert.throws(() => normalizeCSV('Day,Who,Song\n2026-02-01,A,T', { ...mapping, track: 'Who' }));
  assert.throws(() => normalizeCSV('Day,Who,Song\n2026-02-01,A,T', { ...mapping, ms: 'missing' }), /Duration header/);
  for (const row of ['2026-02-30,A,T,60000', '01/02/2026,A,T,60000', '2026-01-01,A,T,-1', '2026-01-01,A,T,86400001']) {
    assert.deepEqual(normalizeCSV('date,artist,track,ms_played\n' + row), [{ invalid: true }]);
  }
});
test('CSV import previews, failures and duplicates never mutate input', async () => {
  const state = empty(), file = new File([csv], 'history.csv');
  const result = await runImport([file], state);
  assert.equal(state.records.length, 0); assert.equal(result.previews[0].from, '2026-01-01');
  assert.equal(result.previews[0].records, 3); assert.equal(result.added, 1);
  const again = await runImport([file], { ...result, csv: true });
  assert.equal(again.records.length, 3); assert.match(again.messages[0], /identical/);
  const invalid = await runImport([new File(['artist,track\nA,T'], 'library.csv')], { ...result, csv: true });
  assert.deepEqual(invalid.records, result.records); assert.equal(invalid.added, 0);
});
test('CSV sessions preserve source/unknown duration and reject disguised priced modes', () => {
  const state = { mode: 'csv', selectedService: 'apple', records: normalizeCSV(csv), filters: { from: '', to: '' }, duplicates: 0 };
  const output = sessionText(state), restored = parseSession(output);
  assert.equal(restored.records[1].source, 'csv'); assert.equal(restored.records[1].ms, null);
  assert.equal(summarize(restored.records).amount, null);
  const encoded = encodeCloud(output);
  assert.equal(decodeCloud({ schema: 1, version: 1, deleted: false, bytes: encoded.bytes, chunks: encoded.chunks.length }, encoded.chunks.map(data => ({ version: 1, data }))), output);
  const input = JSON.parse(output); input.mode = 'import'; input.selectedService = 'spotify';
  assert.throws(() => parseSession(JSON.stringify(input)));
});