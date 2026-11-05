import { validListeningRecord, validRecordDate } from './lib.js';

// User-mapped listening events, not native Apple/YouTube export compatibility.
export function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  const push = () => { row.push(cell); if (row.length > 100) throw new Error('CSV exceeds 100 columns.'); cell = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      push();
      if (c !== ',') { if (row.some(value => value !== '')) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV quoting.'); cell += c; }
    if (row.length > 100 || rows.length > 200001) throw new Error('CSV exceeds 100 columns or 200,000 listening rows.');
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  push(); if (row.some(value => value !== '')) rows.push(row);
  if (row.length > 100 || rows.length > 200001) throw new Error('CSV exceeds import limits.');
  if (rows.length < 2) throw new Error('CSV needs a header and at least one dated listening event. Playlists are not history.');
  const headers = rows[0].map(value => value.trim());
  if (new Set(headers).size !== headers.length || headers.some(value => !value)) throw new Error('CSV headers must be nonempty and unique.');
  if (rows.slice(1).some(values => values.length !== headers.length)) throw new Error('CSV rows must match the header width.');
  return { headers, rows: rows.slice(1) };
}

export function normalizeCSV(text, mapping = { date: 'date', artist: 'artist', track: 'track', ms: 'ms_played' }) {
  const { headers, rows } = csvRows(text);
  const indices = Object.fromEntries(['date', 'artist', 'track', 'ms'].map(key => [key, headers.indexOf(mapping[key])]));
  if (['date', 'artist', 'track'].some(key => indices[key] < 0)) throw new Error('Map date, artist and track to existing CSV headers.');
  if (mapping.ms && indices.ms < 0) throw new Error('Duration header not found. Map milliseconds played or leave the mapping blank for unknown duration.');
  const selected = Object.values(indices).filter(index => index >= 0);
  if (new Set(selected).size !== selected.length) throw new Error('Map each field to a different column.');
  return rows.map(values => {
    const date = values[indices.date].trim(), artist = values[indices.artist].trim(), track = values[indices.track].trim();
    const duration = indices.ms < 0 ? '' : values[indices.ms].trim();
    const ms = duration === '' ? null : /^\d+(\.\d+)?$/.test(duration) ? Number(duration) : NaN;
    const record = { source: 'csv', date, artist, track, ms, supported: true };
    if (!validRecordDate(date) || !validListeningRecord(record)) return { invalid: true };
    record.eventKey = JSON.stringify(['csv', date, artist, track, ms]);
    return record;
  });
}