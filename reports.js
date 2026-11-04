import { RATE, summarize } from './lib.js';

const DAY = 86400000;
const iso = date => date.toISOString().slice(0, 10);
const time = date => Date.parse(`${date}T00:00:00Z`);
export function bounds(records) {
  let from = '', to = '';
  for (const r of records) if (r.date) { if (!from || r.date < from) from = r.date; if (!to || r.date > to) to = r.date; }
  return { from, to };
}
export function presetRange(records, preset) {
  const range = bounds(records); if (!range.to || preset === 'all') return { from: '', to: '' };
  const latest = new Date(time(range.to));
  if (preset === 'month') return { from: `${range.to.slice(0, 7)}-01`, to: range.to };
  if (preset === '12months') return { from: iso(new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - 11, 1))), to: range.to };
  if (/^\d{4}$/.test(preset)) return { from: `${preset}-01-01`, to: `${preset}-12-31` };
  throw new Error('Unknown date preset');
}
export function comparePeriods(records, selected = {}) {
  const available = bounds(records);
  const from = selected.from || available.from, to = selected.to || available.to;
  if (!from || !to || !Number.isFinite(time(from)) || !Number.isFinite(time(to)) || from > to) return null;
  const days = Math.round((time(to) - time(from)) / DAY) + 1;
  const previous = { from: iso(new Date(time(from) - days * DAY)), to: iso(new Date(time(from) - DAY)) };
  const current = summarize(records, { from, to }), prior = summarize(records, previous);
  const old = new Map(prior.artists.map(a => [a.name, a]));
  const now = new Map(current.artists.map(a => [a.name, a]));
  const artists = [...new Set([...now.keys(), ...old.keys()])].map(name => {
    const plays = now.get(name)?.plays || 0, previousPlays = old.get(name)?.plays || 0;
    const share = current.plays ? plays / current.plays * 100 : 0;
    const previousShare = prior.plays ? previousPlays / prior.plays * 100 : 0;
    return { name, plays, previousPlays, delta: share - previousShare, newInPeriod: plays > 0 && previousPlays === 0 };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
  return { from, to, previous, days, current, prior, artists,
    outsideCoverage: previous.from < available.from || to > available.to || from < available.from,
    playChange: prior.plays ? (current.plays - prior.plays) / prior.plays * 100 : null };
}

// Quote every field and neutralize spreadsheet formula prefixes in user metadata.
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function summaryCSV(summary, { source, from = '', to = '', duplicates = 0, attribution = null } = {}) {
  const scrobbles = summary.amount === null && source?.startsWith('Last.fm');
  const unpriced = summary.amount === null;
  const scenario = scrobbles && attribution?.service === 'spotify' && attribution.confirmed && attribution.scenario;
  const assumptions = unpriced && !scrobbles ? 'Self-reported counts. No validated service benchmark; no royalty estimate. Actual duration and eligibility unknown.' : scrobbles ? `Last.fm recorded scrobbles, not verified paid streams. Service ${attribution?.confirmed ? 'self-reported' : 'mixed or unknown'}; actual duration and eligibility unknown. ${scenario ? 'Hypothetical Spotify historical benchmark scenario, not confirmed earnings or artist take-home. Plan and country not adjusted.' : 'No royalty estimate.'} Coverage completeness not verified.` : 'Historical blended estimate; not confirmed earnings or artist take-home. Plan, country, contracts and eligibility not adjusted. Coverage completeness not verified.';
  const header = ['row_type', 'artist', 'included_plays', 'listening_hours', 'personal_listening_share_percent', 'estimated_recording_royalties_usd', 'source', 'from_utc', 'to_utc', 'benchmark', 'benchmark_year', 'usd_per_play', 'short_excluded', 'unsupported_excluded', 'invalid_records_all_dates', 'outside_dates', 'duplicates_removed_all_dates', 'assumptions'];
  if (scrobbles) header[2] = 'recorded_scrobbles';
  if (scenario) header[5] = 'hypothetical_spotify_benchmark_scenario_usd';
  header.push('reported_service', 'service_attribution');
  const priced = !unpriced || scenario;
  const row = (kind, a) => [kind, a.name, a.plays, a.ms === null ? '' : (a.ms / 3600000).toFixed(4), summary.plays ? (a.plays / summary.plays * 100).toFixed(4) : '0', priced ? (a.plays * RATE).toFixed(6) : '', source, from, to, priced ? 'Duetti Spotify sample' : '', priced ? 2024 : '', priced ? RATE : '',
    ...['short', 'unsupported', 'invalid', 'outside'].map(key => kind === 'TOTAL' ? summary.audit?.[key] ?? '' : ''), kind === 'TOTAL' ? duplicates : '', assumptions, attribution?.service || '', attribution ? (attribution.confirmed ? 'self-reported, not verified' : 'mixed / unknown') : ''];
  return '\ufeff' + [header, row('TOTAL', { name: 'All artists', plays: summary.plays, ms: summary.ms }), ...summary.artists.map(a => row('ARTIST', a))].map(r => r.map(csvCell).join(',')).join('\r\n');
}