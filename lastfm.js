export const PAGE_SIZE = 200;
export const MAX_PAGES = 100;
export function validateLastfmQuery(params) {
  const user = (params.get('user') || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(user)) throw new Error('Enter a valid Last.fm username (letters, numbers, hyphens, underscores; up to 50 characters).');
  const page = Number(params.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) throw new Error('Invalid history page.');
  const from = Number(params.get('from')), to = Number(params.get('to'));
  if (!params.has('from') || !params.has('to') || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to > 253402300799) throw new Error('Choose a valid UTC date range.');
  return { user, page, from, to };
}
export function normalizeLastfmPage(data, query) {
  if (data.error) {
    const messages = { 6: 'Last.fm user or parameters could not be found.', 10: 'The server Last.fm API key is invalid.', 11: 'Last.fm is temporarily offline.', 17: 'This Last.fm history is private.', 26: 'The server Last.fm API key is suspended.', 29: 'Last.fm rate limit reached. Wait before refreshing.' };
    throw new Error(messages[data.error] || 'Last.fm could not provide this history. Check the username, privacy settings, or try later.');
  }
  const recent = data.recenttracks, attr = recent?.['@attr'];
  if (!recent || !attr) throw new Error('Last.fm returned an unexpected response.');
  const totalPages = Number(attr.totalPages), page = Number(attr.page);
  if (!Number.isSafeInteger(totalPages) || totalPages < 0 || !Number.isSafeInteger(page) || page !== query.page) throw new Error('Last.fm pagination could not be verified.');
  const list = recent.track == null ? [] : Array.isArray(recent.track) ? recent.track : [recent.track];
  if (list.length > PAGE_SIZE + 1) throw new Error('Last.fm returned too many records.');
  const records = []; let skipped = 0;
  for (const t of list) {
    if (t?.['@attr']?.nowplaying === 'true') { skipped++; continue; }
    const timestamp = Number(t?.date?.uts);
    const artist = typeof t?.artist?.['#text'] === 'string' ? t.artist['#text'].trim() : '';
    const track = typeof t?.name === 'string' ? t.name.trim() : '';
    if (!Number.isSafeInteger(timestamp) || timestamp < query.from || timestamp >= query.to || !artist || !track || artist.length > 500 || track.length > 1000) { skipped++; continue; }
    records.push({ source: 'lastfm', date: new Date(timestamp * 1000).toISOString().slice(0, 10), artist, track, ms: null, supported: true,
      eventKey: JSON.stringify([timestamp, artist, track]) });
  }
  return { records, skipped, page, totalPages };
}

// One validated endpoint and fixed upstream host; never an arbitrary URL proxy.
export async function fetchLastfmPage(query, key, fetcher = fetch, signal) {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  const args = { method: 'user.getrecenttracks', format: 'json', api_key: key, limit: PAGE_SIZE, user: query.user, page: query.page,
    from: Math.max(0, query.from - 1), to: query.to };
  for (const [name, value] of Object.entries(args)) url.searchParams.set(name, value);
  const response = await fetcher(url, { signal: signal || AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 429 ? 'Last.fm rate limit reached. Try again later.' : 'Last.fm is temporarily unavailable.');
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) throw new Error('Last.fm response exceeded the safety limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return normalizeLastfmPage(JSON.parse(new TextDecoder().decode(bytes)), query);
}

export function createLimiter({ limit = 120, windowMs = 60000 } = {}) {
  let start = 0, count = 0;
  return (now = Date.now()) => {
    if (now - start >= windowMs) { start = now; count = 0; }
    if (count >= limit) return false;
    count++; return true;
  };
}