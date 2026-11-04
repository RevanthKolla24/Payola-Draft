import test from 'node:test';
import assert from 'node:assert/strict';
import { bounds, presetRange, comparePeriods, csvCell, summaryCSV } from '../reports.js';
import { summarize, manualSummary } from '../lib.js';
const r = (date, artist = 'Artist') => ({ date, artist, track: 'Track', supported: true, ms: 60000 });
test('date presets use imported dates, not the current clock', () => {
  const records = [r('2024-02-29'), r('2023-01-01')];
  assert.deepEqual(bounds(records), { from: '2023-01-01', to: '2024-02-29' });
  assert.deepEqual(presetRange(records, 'month'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(presetRange(records, '12months'), { from: '2023-03-01', to: '2024-02-29' });
  assert.deepEqual(presetRange(records, '2023'), { from: '2023-01-01', to: '2023-12-31' });
  assert.deepEqual(presetRange([], 'month'), { from: '', to: '' });
});
test('comparison uses inclusive equal-length windows across leap days', () => {
  const c = comparePeriods([r('2024-01-03', 'Old'), r('2024-02-01', 'Old'), r('2024-02-29', 'New')], { from: '2024-02-01', to: '2024-02-29' });
  assert.equal(c.days, 29); assert.deepEqual(c.previous, { from: '2024-01-03', to: '2024-01-31' });
  assert.equal(c.current.plays, 2); assert.equal(c.prior.plays, 1); assert.equal(c.playChange, 100);
  assert.equal(c.artists.find(a => a.name === 'New').newInPeriod, true);
  assert.equal(c.outsideCoverage, false);
});
test('zero baselines never divide by zero and missing coverage is flagged', () => {
  const c = comparePeriods([r('2026-06-01')]);
  assert.equal(c.playChange, null); assert.equal(c.outsideCoverage, true);
  assert.equal(comparePeriods([]), null);
});
test('CSV quotes commas, quotes, newlines and neutralizes formula prefixes', () => {
  assert.equal(csvCell('A,"B"'), '"A,""B"""');
  for (const s of ['=SUM(A1)', '+1', '-2', '@cmd', '  =1', '\tname']) assert.ok(csvCell(s).startsWith('"\''));
  assert.equal(csvCell('ordinary'), '"ordinary"');
});
test('CSV includes all artists, total audit and portable assumptions', () => {
  const csv = summaryCSV(summarize([r('2026-01-01', '=evil'), r('2026-01-02', 'Other')]), { source: 'Fictional sample', from: '2026-01-01', to: '2026-01-02', duplicates: 3 });
  assert.equal(csv.charCodeAt(0), 0xfeff); assert.ok(csv.includes('"\'=evil"'));
  assert.ok(csv.includes('"TOTAL","All artists","2"')); assert.ok(csv.includes('"2024","0.003"'));
  assert.ok(csv.includes('not confirmed earnings')); assert.equal(csv.split('\r\n').length, 4);
  const manual = summaryCSV(manualSummary('Name', 10), { source: 'Self-reported' });
  assert.ok(manual.includes('"Name","10",""'));
});