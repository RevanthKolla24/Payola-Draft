import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLastfmQuery, normalizeLastfmPage, fetchLastfmPage, createLimiter } from '../lastfm.js';
import { loadLastfm } from '../lastfm-client.js';
import { summarize } from '../lib.js';
import { summaryCSV } from '../reports.js';
const query = { user: 'tester', from: 1000000000, to: 1000086400, page: 1 };
const track = { name: 'Track', artist: { '#text': 'Artist' }, date: { uts: '1000000000' } };
const response = (tracks = [track], page = 1, pages = 1) => ({ recenttracks: { track: tracks, '@attr': { page: String(page), totalPages: String(pages) } } });
test('validates proxy inputs and rejects URL injection and invalid ranges', () => {
  assert.deepEqual(validateLastfmQuery(new URLSearchParams(query)), query);
  for (const overrides of [{ user: '../secret' }, { page: '1.2' }, { from: '-1' }, { to: '0' }, { page: '101' }]) assert.throws(() => validateLastfmQuery(new URLSearchParams({ ...query, ...overrides })));
});
test('normalizes dated scrobbles, filters now playing and respects UTC bounds', () => {
  const data = normalizeLastfmPage(response([track, { ...track, '@attr': { nowplaying: 'true' } }, { ...track, date: { uts: String(query.to) } }, { name: 'bad' }]), query);
  assert.equal(data.records.length, 1); assert.equal(data.skipped, 3);
  assert.equal(data.records[0].source, 'lastfm'); assert.equal(data.records[0].ms, null);
  assert.equal(summarize(data.records).amount, null); assert.equal(summarize(data.records).ms, null);
  const csv = summaryCSV(summarize(data.records), { source: 'Last.fm' });
  assert.match(csv, /recorded_scrobbles/); assert.doesNotMatch(csv, /Duetti Spotify sample/); assert.match(csv, /No royalty estimate/);
});
test('Last.fm errors and malformed pagination are rejected', () => {
  assert.throws(() => normalizeLastfmPage({ error: 10 }, query), /API key/);
  assert.throws(() => normalizeLastfmPage({ error: 17 }, query), /private/);
  assert.throws(() => normalizeLastfmPage(response([], 2), query), /pagination/);
});
test('fixed upstream method, key and limit; response data is minimized', async () => {
  const result = await fetchLastfmPage(query, 'secret-key', async url => {
    assert.equal(url.hostname, 'ws.audioscrobbler.com'); assert.equal(url.searchParams.get('limit'), '200');
    assert.equal(url.searchParams.get('api_key'), 'secret-key'); return Response.json(response());
  });
  assert.equal(result.records.length, 1); assert.ok(!JSON.stringify(result).includes('secret-key'));
});
test('client paginates completely and collapses overlapping entries', async () => {
  let calls = 0;
  const result = await loadLastfm({ user: 'tester', from: '2001-09-09', to: '2001-09-10', fetcher: async () => {
    calls++; return Response.json({ records: [{ eventKey: 'same', source: 'lastfm', date: '2001-09-09', artist: 'Artist', track: 'Track', ms: null, supported: true }], skipped: 0, page: calls, totalPages: 2 });
  } });
  assert.equal(calls, 2); assert.equal(result.records.length, 1); assert.equal(result.duplicates, 1);
});
test('client rejects incomplete ranges and supports cancellation', async () => {
  await assert.rejects(loadLastfm({ user: 'tester', from: '2026-01-01', to: '2026-01-02', fetcher: async () => Response.json({ records: [], page: 1, totalPages: 101 }) }), /shorter date range/);
  const c = new AbortController(); c.abort();
  await assert.rejects(loadLastfm({ user: 'tester', from: '2026-01-01', to: '2026-01-02', signal: c.signal }), { name: 'AbortError' });
});
test('rate limiter enforces a bounded window', () => {
  const allow = createLimiter({ limit: 2, windowMs: 100 });
  assert.equal(allow(1000), true); assert.equal(allow(1001), true); assert.equal(allow(1002), false); assert.equal(allow(1100), true);
});
test('client rejects invalid calendar dates before fetching', async () => {
  for (const from of ['2026-02-30', '2025-02-29', '10000-01-01', '1969-12-31']) {
    await assert.rejects(loadLastfm({ user: 'tester', from, to: '2026-03-03', fetcher: () => { assert.fail('Invalid dates must not fetch'); } }), /valid date range/);
  }
});
test('client rejects malformed records, counters and inconsistent pagination', async () => {
  const record = { eventKey: 'key', source: 'lastfm', date: '2026-01-01', artist: 'Artist', track: 'Track', ms: null, supported: true };
  const page = { records: [record], skipped: 0, page: 1, totalPages: 1 };
  const options = { user: 'tester', from: '2026-01-01', to: '2026-01-02' };
  for (const patch of [null, { skipped: -1 }, { skipped: 202 }, { skipped: '1' }, { records: Array(202).fill(record) }, { totalPages: 0 }, ...[{ eventKey: undefined }, { eventKey: '' }, { date: '2026-01-03' }, { ms: 60000 }, { artist: '' }, { source: 'csv' }].map(patch => ({ records: [{ ...record, ...patch }] }))]) {
    await assert.rejects(loadLastfm({ ...options, fetcher: async () => Response.json(patch === null ? null : { ...page, ...patch }) }), /Invalid history/);
  }
  let calls = 0;
  await assert.rejects(loadLastfm({ ...options, fetcher: async () => Response.json({ ...page, page: ++calls, totalPages: calls === 1 ? 2 : 1 }) }), /Invalid history/);
  const empty = await loadLastfm({ ...options, fetcher: async () => Response.json({ ...page, records: [], totalPages: 0 }) });
  assert.equal(empty.records.length, 0);
});
test('client preserves cancellation across fetch, body parsing and final progress callbacks', async () => {
  for (const stage of ['fetch', 'body', 'body-error', 'progress']) {
    const controller = new AbortController();
    await assert.rejects(loadLastfm({ user: 'tester', from: '2026-01-01', to: '2026-01-02', signal: controller.signal,
      fetcher: async () => {
        if (stage === 'fetch') controller.abort();
        return { ok: true, json: async () => {
          if (stage.startsWith('body')) controller.abort();
          if (stage === 'body-error') throw new DOMException('Cancelled', 'AbortError');
          return { records: [], skipped: 0, page: 1, totalPages: 1 };
        } };
      }, progress: message => { if (stage === 'progress' && message.startsWith('Loaded')) controller.abort(); }
    }), { name: 'AbortError' });
  }
});