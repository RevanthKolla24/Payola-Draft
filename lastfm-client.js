export async function loadLastfm({ user, from, to, signal, progress = () => {}, fetcher = fetch }) {
  const records = [], seen = new Set(); let skipped = 0, duplicates = 0;
  // Fixed end-date snapshot avoids moving now-playing history during paging.
  const start = Date.parse(`${from}T00:00:00Z`) / 1000;
  const end = Date.parse(`${to}T00:00:00Z`) / 1000 + 86400;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw new Error('Choose a valid date range starting in 1970 or later.');
  for (let page = 1; page <= 100; page++) {
    signal?.throwIfAborted();
    progress(`Loading Last.fm page ${page}…`, (page - 1) / 100);
    const query = new URLSearchParams({ user, from: start, to: end, page });
    const response = await fetcher(`/api/lastfm?${query}`, { signal, cache: 'no-store' });
    let data;
    try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
    if (!response.ok) throw new Error(data.error || 'Could not load Last.fm history.');
    if (!Array.isArray(data.records) || data.page !== page || !Number.isSafeInteger(data.totalPages) || data.totalPages < 0) throw new Error('Invalid history response.');
    if (data.totalPages > 100) throw new Error('This range exceeds 100 pages (about 20,000 scrobbles). Choose a shorter date range. No partial result was saved.');
    for (const r of data.records) {
      if (seen.has(r.eventKey)) { duplicates++; continue; }
      seen.add(r.eventKey); records.push(r);
    }
    skipped += data.skipped || 0;
    progress(`Loaded page ${page} of ${Math.max(1, data.totalPages)} · ${records.length} dated scrobbles`, page / Math.max(1, data.totalPages));
    if (page >= data.totalPages) return { records, skipped, duplicates, pages: page };
    // Modest pacing; aborted waits also stop promptly.
    await new Promise((resolve, reject) => {
      const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(done, 600);
      function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); }
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  throw new Error('Page limit reached. Choose a shorter range.');
}