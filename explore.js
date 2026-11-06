import { summarize, validTimestamp } from './lib.js';
import { bounds, comparePeriods } from './reports.js';
import { listeningInsights } from './insights.js';

export function includedRecords(records, filters = {}) {
  return records.filter(r => !r.invalid && r.supported && (!filters.from || r.date >= filters.from) && (!filters.to || r.date <= filters.to) && (r.source === 'lastfm' || r.ms === null || r.ms >= 30000));
}

export function qualityReport(records, filters = {}, duplicates = 0) {
  const summary = summarize(records, filters), included = includedRecords(records, filters);
  return { records: records.length, ...summary.audit, duplicates, knownDuration: included.filter(r => r.ms !== null).length, unknownDuration: included.filter(r => r.ms === null).length, coverage: bounds(records.filter(r => !r.invalid)), filtered: { from: filters.from || '', to: filters.to || '' } };
}

export function recap(summary) {
  const insights = listeningInsights(summary);
  return { plays: summary.plays, hours: summary.ms === null ? null : summary.ms / 3600000, artists: summary.artists.length, topArtists: summary.artists.slice(0, 10), topTracks: insights.tracks, concentration: insights.concentration, months: summary.months || [] };
}

export function artistDetails(records, name, filters = {}) {
  const current = includedRecords(records, filters).filter(r => r.artist === name);
  const range = bounds(current), summary = summarize(current);
  const comparison = comparePeriods(records, filters);
  return { first: range.from, last: range.to, months: summary.months, tracks: listeningInsights(summary).tracks,
    change: comparison?.artists.find(a => a.name === name) || null, outsideCoverage: comparison?.outsideCoverage ?? true };
}

export function listeningPatterns(records, filters = {}) {
  const included = includedRecords(records, filters), timed = included.filter(r => validTimestamp(r.timestamp, r.date));
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0), dates = new Map();
  for (const r of timed) {
    const time = new Date(r.timestamp);
    hours[time.getUTCHours()]++; weekdays[time.getUTCDay()]++;
    dates.set(r.date, (dates.get(r.date) || 0) + 1);
  }
  const ordered = [...dates.keys()].sort();
  let longest = 0, streak = 0, previous = null;
  for (const date of ordered) {
    const time = Date.parse(`${date}T00:00:00Z`);
    streak = previous !== null && time - previous === 86400000 ? streak + 1 : 1;
    longest = Math.max(longest, streak); previous = time;
  }
  return { timed: timed.length, included: included.length, hours, weekdays, longest,
    busiest: [...dates.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5) };
}

export function compareSessions(left, right) {
  const summarizeSession = s => s.mode === 'manual' ? s.manual : summarize(s.records, s.filters);
  const a = summarizeSession(left), b = summarizeSession(right);
  const artistsA = new Map(a.artists.map(x => [x.name, x])), artistsB = new Map(b.artists.map(x => [x.name, x]));
  const tracks = summary => new Set(summary.artists.flatMap(x => [...x.tracks.keys()].map(title => JSON.stringify([x.name, title]))));
  const ta = tracks(a), tb = tracks(b);
  const sharedArtists = [...artistsA.keys()].filter(name => artistsB.has(name)).length;
  const changes = [...new Set([...artistsA.keys(), ...artistsB.keys()])].map(name => {
    const before = artistsA.get(name)?.plays || 0, after = artistsB.get(name)?.plays || 0;
    return { name, before, after, delta: (b.plays ? after / b.plays * 100 : 0) - (a.plays ? before / a.plays * 100 : 0) };
  }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.name.localeCompare(y.name));
  const describe = (s, summary) => ({ mode: s.mode, service: s.selectedService, plays: summary.plays, hours: s.mode === 'lastfm' || summary.ms === null ? null : summary.ms / 3600000, artists: summary.artists.length, observed: bounds(s.records.filter(r => !r.invalid)), filters: s.filters, declaration: s.mode === 'lastfm' ? { service: s.attribution.service, confirmed: s.attribution.confirmed, from: s.attribution.from, to: s.attribution.to } : null });
  return { left: describe(left, a), right: describe(right, b), sharedArtists, sharedTracks: [...ta].filter(key => tb.has(key)).length, changes };
}

// Intentionally exclude filenames, artist/track metadata, timestamps and raw records.
export function safeDiagnostics(report, fileReports = []) {
  const counts = Object.fromEntries(['records', 'included', 'short', 'unsupported', 'invalid', 'outside', 'duplicates', 'knownDuration', 'unknownDuration'].map(key => [key, report[key]]));
  return { format: 'payola-diagnostics', version: 1, ...counts, coverage: { from: report.coverage.from, to: report.coverage.to }, filtered: { from: report.filtered.from, to: report.filtered.to }, files: fileReports.map((file, i) => ({ file: i + 1, status: ['accepted', 'rejected', 'duplicate file'].includes(file.status) ? file.status : 'accepted', records: file.records || 0, added: file.added || 0, duplicates: file.duplicates || 0, invalid: file.invalid || 0, short: file.short || 0, unsupported: file.unsupported || 0 })) };
}