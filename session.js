import { manualSummary, manualArtistsSummary, RATE, validRecordDate as date, validListeningRecord } from './lib.js';
import { attribution } from './attribution.js';

export const MAX_SESSION_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RECORDS = 200000;
const fail = () => { throw new Error('Invalid or unsupported Payola Reciept session.'); };
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_RECORDS * 100;
const text = (value, max) => typeof value === 'string' && value.length <= max;

// Reconstruct only known fields. Session data is untrusted, never executable or verified.
export function validateSession(input) {
  if (!input || input.format !== 'payola-draft-session' || ![1, 2].includes(input.version) || !['sample', 'import', 'csv', 'lastfm', 'manual'].includes(input.mode)) fail();
  if (input.version === 2 && (input.mode !== 'manual' || !Array.isArray(input.manual?.artists))) fail();
  if (input.benchmark?.usdPerPlay !== RATE || input.benchmark?.year !== 2024 || input.benchmark?.source !== 'Duetti Spotify sample') fail();
  if (!['spotify', 'apple', 'youtube'].includes(input.selectedService)) fail();
  const filters = input.filters;
  if (!filters || !['from', 'to'].every(key => filters[key] === '' || date(filters[key])) || (filters.from && filters.to && filters.from > filters.to)) fail();
  if (!Array.isArray(input.records) || input.records.length > MAX_RECORDS || !count(input.duplicates)) fail();
  const mode = input.mode;
  if ((mode === 'import' || mode === 'sample') && input.selectedService !== 'spotify') fail();
  const records = input.records.map(r => {
    if (!r || typeof r !== 'object') fail();
    if (r.invalid === true && mode !== 'lastfm') return { invalid: true };
    if (!r.supported && mode !== 'lastfm') r = { ...r, artist: r.artist ?? '', track: r.track ?? '' };
    if (!validListeningRecord(r, mode === 'lastfm')) fail();
    if ((mode === 'csv') !== (r.source === 'csv')) fail();
    return { date: r.date, artist: r.artist, track: r.track, supported: r.supported, ms: r.ms, ...(['lastfm', 'csv'].includes(mode) ? { source: mode } : {}), ...(r.eventKey ? { eventKey: r.eventKey } : {}), ...(r.timestamp ? { timestamp: r.timestamp } : {}) };
  });
  let declaration = attribution(), loaded = null, manual = null;
  if (mode === 'lastfm') {
    const a = input.attribution;
    if (!a || typeof a.confirmed !== 'boolean' || typeof a.scenario !== 'boolean' || !date(a.from) || !date(a.to) || a.from > a.to) fail();
    declaration = { ...attribution(a.service, a.confirmed, false), from: a.from, to: a.to };
    if (records.some(r => r.date < a.from || r.date > a.to)) fail();
    if (!input.lastfm || !count(input.lastfm.skipped) || !count(input.lastfm.duplicates)) fail();
    loaded = { skipped: input.lastfm.skipped, duplicates: input.lastfm.duplicates };
  }
  if (mode === 'manual') {
    if (records.length || filters.from || filters.to || !input.manual) fail();
    if (input.version === 2) manual = manualArtistsSummary(input.manual.artists);
    else {
      if (!text(input.manual.artist, 100) || input.manual.artists !== undefined) fail();
      manual = manualSummary(input.manual.artist, input.manual.plays);
    }
    if (input.selectedService !== 'spotify') manual.amount = null;
  }
  return { mode, selectedService: input.selectedService, records, filters: { from: filters.from, to: filters.to }, duplicates: input.duplicates, attribution: declaration, lastfm: loaded, manual };
}

export function sessionText(state) {
  const data = { format: 'payola-draft-session', version: 1, benchmark: { source: 'Duetti Spotify sample', year: 2024, usdPerPlay: RATE }, ...state };
  if (state.mode === 'manual' && Array.isArray(state.manual?.artists)) data.version = 2;
  validateSession(data);
  const output = JSON.stringify(data);
  if (new TextEncoder().encode(output).byteLength > MAX_SESSION_FILE_BYTES) throw new Error('Session exceeds the 25 MB download/restore limit. A summary CSV is not a full backup. Keep this tab open until you have preserved your history.');
  return output;
}

export function parseSession(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_SESSION_FILE_BYTES) throw new Error('Session exceeds the 25 MB restore limit.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Session is not valid JSON.'); }
  return validateSession(data);
}