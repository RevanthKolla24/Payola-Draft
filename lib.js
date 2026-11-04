export const RATE = 0.003;
export const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
export const number = value => new Intl.NumberFormat('en-US').format(value);
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function normalizeRecords(data) {
  if (!Array.isArray(data)) throw new Error('Expected a JSON array. Please choose an unzipped Spotify Extended Streaming History JSON file.');
  if (!data.length || !data.some(r => r && typeof r === 'object' && 'ms_played' in r && 'ts' in r)) {
    throw new Error('This is not a supported Extended Streaming History file. Look for Streaming_History_Audio…json.');
  }
  return data.map(r => {
    if (!r || typeof r !== 'object') return { invalid: true };
    const timestamp = typeof r.ts === 'string' ? Date.parse(r.ts) : NaN;
    const duration = r.ms_played;
    const artist = typeof r.master_metadata_album_artist_name === 'string' ? r.master_metadata_album_artist_name.trim() : '';
    const track = typeof r.master_metadata_track_name === 'string' ? r.master_metadata_track_name.trim() : '';
    const isTrack = typeof r.spotify_track_uri === 'string' && r.spotify_track_uri.startsWith('spotify:track:');
    if (!Number.isFinite(timestamp) || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return { invalid: true };
    const normalized = { date: new Date(timestamp).toISOString().slice(0, 10), artist, track, ms: duration, supported: Boolean(isTrack && artist && track) };
    // Keep only a playback identity, never IP addresses or account identifiers.
    normalized.eventKey = JSON.stringify([timestamp, r.spotify_track_uri || null, artist, track, duration]);
    return normalized;
  });
}

export function summarize(records, { from = '', to = '' } = {}) {
  const artists = new Map();
  const months = new Map();
  const audit = { included: 0, short: 0, unsupported: 0, invalid: 0, outside: 0 };
  let ms = 0;
  const scrobbles = records.some(r => r.source === 'lastfm');
  for (const r of records) {
    if (r.invalid) { audit.invalid++; continue; }
    if ((from && r.date < from) || (to && r.date > to)) { audit.outside++; continue; }
    if (!r.supported) { audit.unsupported++; continue; }
    if (r.source !== 'lastfm' && r.ms < 30000) { audit.short++; continue; }
    audit.included++; ms += r.ms || 0;
    const month = r.date.slice(0, 7);
    const bucket = months.get(month) || { month, plays: 0, ms: 0 };
    bucket.plays++; bucket.ms += r.ms || 0; months.set(month, bucket);
    let artist = artists.get(r.artist);
    if (!artist) { artist = { name: r.artist, plays: 0, ms: 0, tracks: new Map() }; artists.set(r.artist, artist); }
    artist.plays++; artist.ms += r.ms || 0;
    artist.tracks.set(r.track, (artist.tracks.get(r.track) || 0) + 1);
  }
  if (scrobbles) { ms = null; for (const a of artists.values()) a.ms = null; for (const m of months.values()) m.ms = null; }
  return { audit, ms, plays: audit.included, amount: scrobbles ? null : audit.included * RATE, months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    artists: [...artists.values()].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name)) };
}

// Match occurrences across files, not within one file. If an export repeats an
// identical event twice, retain both; another export of those events adds none.
export function mergeRecords(existing, incoming, occurrences) {
  const local = new Map();
  let duplicates = 0, added = 0;
  for (const r of incoming) {
    if (!r.eventKey) { existing.push(r); added++; continue; }
    const count = (local.get(r.eventKey) || 0) + 1;
    local.set(r.eventKey, count);
    if (count <= (occurrences.get(r.eventKey) || 0)) { duplicates++; continue; }
    existing.push(r); added++;
  }
  for (const [key, count] of local) occurrences.set(key, Math.max(count, occurrences.get(key) || 0));
  return { added, duplicates };
}

export function listeningShares(artists, total) {
  if (!total) return [];
  const top = artists.slice(0, 5).map(a => ({ name: a.name, plays: a.plays, percent: a.plays / total * 100 }));
  const other = total - top.reduce((sum, a) => sum + a.plays, 0);
  if (other > 0) top.push({ name: 'Other artists', plays: other, percent: other / total * 100 });
  return top;
}

export function manualSummary(name, plays) {
  if (!name.trim() || name.trim().length > 100) throw new Error('Enter an artist name between 1 and 100 characters.');
  if (!Number.isSafeInteger(plays) || plays < 1 || plays > 10000000) throw new Error('Enter a whole play count from 1 to 10,000,000.');
  return { plays, amount: plays * RATE, ms: null, audit: null, artists: [{ name: name.trim(), plays, ms: null, tracks: new Map() }] };
}

export function sampleRecords() {
  const seeds = [
    ['Luna Vale', ['Afterglow', 'Blue hour', 'Stay a little'], 842],
    ['The Sunday Club', ['Slow mornings', 'Apartment 4', 'Sunroom'], 625],
    ['Miles West', ['Coastline', 'Passenger seat', 'Open road'], 486],
    ['Olive & the Echoes', ['Wildflower', 'Soft landing', 'Garden song'], 354],
    ['Nova Bloom', ['Satellite', 'Everything in color', 'Orbit'], 248],
    ['August Fields', ['Somewhere quiet', 'Home again', 'Paper planes'], 172],
  ];
  const records = [];
  for (const [artist, tracks, count] of seeds) {
    for (let i = 0; i < count; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + (i * 17 + artist.length) % 304)).toISOString().slice(0, 10);
      records.push({ artist, track: tracks[i % tracks.length], date, ms: 160000 + (i % 90) * 1000, supported: true });
    }
  }
  for (let i = 0; i < 93; i++) records.push({ artist: 'Luna Vale', track: 'Afterglow', date: '2026-05-02', ms: 12000, supported: true });
  for (let i = 0; i < 18; i++) records.push({ date: '2026-05-02', ms: 120000, supported: false });
  return records;
}