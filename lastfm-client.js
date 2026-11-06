import { validRecordDate, validListeningRecord } from './lib.js';

export async function loadLastfm({ user, from, to, signal, progress = () => {}, fetcher = fetch }) {
  const records = [], seen = new Set(); let skipped = 0, duplicates = 0;
  if (!validRecordDate(from) || !validRecordDate(to)) throw new Error('Choose a valid date range starting in 1970 or later.');
  // Fixed end-date snapshot avoids moving now-playing history during paging.
  const start = Date.parse(`${from}T00:00:00Z`) / 1000;
  const end = Date.parse(`${to}T00:00:00Z`) / 1000 + 86400;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw new Error('Choose a valid date range starting in 1970 or later.');
  for (let page = 1; page <= 100; page++) {
    signal?.throwIfAborted();
    progress(`Loading Last.fm page ${page}…`, (page - 1) / 100);
    const query = new URLSearchParams({ user, from: start, to: end, page });
    const response = await fetcher(`/api/lastfm?${query}`, { signal, cache: 'no-store' });
    signal?.throwIfAborted();
    let data;
    try { data = await response.json(); } catch (error) {
      signal?.throwIfAborted();
      if (error.name === 'AbortError') throw error;
      throw new Error('The server returned an unreadable response.');
    }
    signal?.throwIfAborted();
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not load Last.fm history.');
    if (!data || !Array.isArray(data.records) || data.page !== page || !Number.isSafeInteger(data.totalPages) || data.totalPages < 0) throw new Error('Invalid history response.');
    if (data.totalPages > 100) throw new Error('This range exceeds 100 pages (about 20,000 scrobbles). Choose a shorter date range. No partial result was saved.');
    if (data.records.length > 201 || !Number.isSafeInteger(data.skipped) || data.skipped < 0 || data.skipped > 201
      || data.records.length + data.skipped > 201
      || (data.totalPages === 0 ? page !== 1 || data.records.length > 0 : page > data.totalPages)) throw new Error('Invalid history response.');
    for (const r of data.records) {
      if (!validListeningRecord(r, true) || typeof r.eventKey !== 'string' || !r.eventKey.trim() || r.date < from || r.date > to) throw new Error('Invalid history record. No partial result was saved.');
      if (seen.has(r.eventKey)) { duplicates++; continue; }
      seen.add(r.eventKey); records.push(r);
    }
    skipped += data.skipped;
    progress(`Loaded page ${page} of ${Math.max(1, data.totalPages)} · ${records.length} dated scrobbles`, page / Math.max(1, data.totalPages));
    signal?.throwIfAborted();
    if (page >= data.totalPages) return { records, skipped, duplicates, pages: page };
    // Modest pacing; aborted waits also stop promptly.
    await new Promise((resolve, reject) => {
      const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(done, 600);
      function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); }
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  throw new Error('Page limit reached. Choose a shorter range.');
}