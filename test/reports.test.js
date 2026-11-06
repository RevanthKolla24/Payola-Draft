import test from 'node:test';
import assert from 'node:assert/strict';
import { bounds, presetRange, comparePeriods, csvCell, summaryCSV } from '../reports.js';
import { summarize, manualSummary } from '../lib.js';
const r = (date, artist = 'Artist') => ({ date, artist, track: 'Track', supported: true, ms: 60000 });
test('early-year presets retain the actual century and never create unsupported dates', () => {
  assert.deepEqual(presetRange([r('0050-06-15')], '12months'), { from: '0049-07-01', to: '0050-06-15' });
  assert.deepEqual(presetRange([r('0000-01-01')], '12months'), { from: '0000-01-01', to: '0000-01-01' });
  assert.equal(comparePeriods([r('0000-01-01')]), null);
  assert.equal(comparePeriods([r('2026-01-01')], { from: '2026-02-30', to: '2026-03-01' }), null);
  assert.equal(comparePeriods([r('2026-01-01')], { from: '10000-01-01', to: '10000-02-01' }), null);
});
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
test('CSV event disclosures distinguish supplied durations from unknown and manual counts', () => {
  const known = { ...r('2026-01-01'), source: 'csv', ms: 3600000 };
  const unknown = { ...r('2026-01-02'), source: 'csv', ms: null };
  for (const records of [[known], [unknown], [known, unknown]]) {
    const summary = summarize(records);
    const csv = summaryCSV(summary, { sourceType: 'csv', source: 'User-provided CSV history · Spotify self-reported' });
    assert.match(csv, /User-provided dated CSV listening events/);
    assert.match(csv, /Stream eligibility and coverage completeness are not verified/);
    assert.match(csv, /No royalty estimate/);
    assert.doesNotMatch(csv, /Self-reported counts|Actual duration and eligibility unknown/);
    if (summary.ms === null) {
      assert.match(csv, /Some or all included events have unknown duration/);
      assert.match(csv, new RegExp(`"TOTAL","All artists","${records.length}",""`));
    } else {
      assert.match(csv, /Listening hours use supplied durations/);
      assert.match(csv, /"TOTAL","All artists","1","1.0000"/);
      assert.doesNotMatch(csv, /duration unknown|unknown duration/);
    }
  }
  const manual = { ...manualSummary('Name', 10), amount: null };
  const csv = summaryCSV(manual, { sourceType: 'manual', source: 'Self-reported Apple Music' });
  assert.match(csv, /Self-reported counts/);
  assert.match(csv, /Actual duration and eligibility unknown/);
  assert.doesNotMatch(csv, /dated CSV listening events/);
});
test('CSV includes all artists, total audit and portable assumptions', () => {
  const csv = summaryCSV(summarize([r('2026-01-01', '=evil'), r('2026-01-02', 'Other')]), { source: 'Fictional sample', from: '2026-01-01', to: '2026-01-02', duplicates: 3 });
  assert.equal(csv.charCodeAt(0), 0xfeff); assert.ok(csv.includes('"\'=evil"'));
  assert.ok(csv.includes('"TOTAL","All artists","2"')); assert.ok(csv.includes('"2024","0.003"'));
  assert.ok(csv.includes('not confirmed earnings')); assert.equal(csv.split('\r\n').length, 4);
  const manual = summaryCSV(manualSummary('Name', 10), { source: 'Self-reported' });
  assert.ok(manual.includes('"Name","10",""'));
});