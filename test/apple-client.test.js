import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { APPLE_RECENT_PATH, recentItems, nextRecentPath } from '../apple.js';
import { escapeHTML as esc } from '../lib.js';

const source = (await readFile(new URL('../apple-client.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(fetcher, sdk = {}) {
  const elements = new Map(), timers = new Map(), events = new Map();
  let timerID = 0;
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      disabled: false, hidden: false, textContent: '', html: '',
      addEventListener(type, listener) { this[type] = listener; },
      replaceChildren() { this.html = ''; },
      insertAdjacentHTML(_, html) { this.html += html; }
    });
    return elements.get(selector);
  };
  const window = {
    MusicKit: { configure: async () => {}, getInstance: () => ({ authorize: async () => 'user-token', unauthorize: async () => {}, ...sdk }) },
    addEventListener: (type, listener) => events.set(type, listener)
  };
  vm.runInNewContext(source, {
    APPLE_RECENT_PATH, recentItems, nextRecentPath, esc, window,
    document: { querySelector: element }, fetch: fetcher, AbortController,
    setTimeout: (callback, delay) => { const id = ++timerID; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  return {
    element, window, events,
    click: selector => element(selector).click(),
    timeout(delay) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `Expected a ${delay}ms timeout`);
      timers.delete(entry[0]); entry[1].callback();
    }
  };
}
const config = () => Response.json({ developerToken: 'developer-token' });
const content = name => Response.json({ data: [{ id: name, attributes: { name, artistName: 'Artist' } }] });

test('Apple configuration timeout releases prepare and allows a successful retry', async () => {
  let attempts = 0;
  const client = harness(async (_, { signal }) => {
    if (++attempts > 1) return config();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const pending = client.click('#apple-prepare');
  assert.equal(client.element('#apple-prepare').disabled, true);
  client.timeout(8000); await pending;
  assert.match(client.element('#apple-status').textContent, /timed out/);
  assert.equal(client.element('#apple-prepare').disabled, false);
  await client.click('#apple-prepare');
  assert.match(client.element('#apple-status').textContent, /Ready/);
});

test('Apple configuration rejects a body completed after timeout and invalid tokens', async () => {
  const body = deferred();
  const client = harness(async () => ({ ok: true, json: () => body.promise }));
  const pending = client.click('#apple-prepare');
  await Promise.resolve(); client.timeout(8000);
  body.resolve({ developerToken: 'late-token' }); await pending;
  assert.match(client.element('#apple-status').textContent, /timed out/);
  const invalid = harness(async () => Response.json({ developerToken: '' }));
  await invalid.click('#apple-prepare');
  assert.match(invalid.element('#apple-status').textContent, /did not include/);
});

test('Apple preparation ignores results superseded by pagehide', async () => {
  const configure = deferred();
  const client = harness(async () => config());
  client.window.MusicKit.configure = () => configure.promise;
  const pending = client.click('#apple-prepare');
  await new Promise(resolve => setImmediate(resolve));
  client.events.get('pagehide')();
  configure.resolve(); await pending;
  assert.doesNotMatch(client.element('#apple-status').textContent, /Ready/);
});

test('Apple request timeout after fetch or during parsing preserves the previous preview', async () => {
  for (const stage of ['fetch', 'json']) {
    const delayed = deferred();
    let refreshing = false;
    const client = harness(async url => {
      if (url === '/api/apple/config') return config();
      if (!refreshing) return content('Original');
      return stage === 'fetch' ? delayed.promise : { ok: true, json: () => delayed.promise };
    });
    await client.click('#apple-prepare'); await client.click('#apple-authorize');
    const original = client.element('#apple-items').html;
    refreshing = true;
    const pending = client.click('#apple-refresh');
    await Promise.resolve(); client.timeout(15000);
    delayed.resolve(stage === 'fetch' ? content('Late') : { data: [{ attributes: { name: 'Late', artistName: 'Artist' } }] });
    await pending;
    assert.equal(client.element('#apple-items').html, original);
    assert.match(client.element('#apple-status').textContent, /timed out or was cancelled/);
    assert.equal(client.element('#apple-refresh').disabled, false);
  }
});

test('Apple disconnect serializes SDK operations and cannot overwrite a later authorization', async () => {
  const disconnect = deferred();
  let authorizations = 0;
  const client = harness(async url => url === '/api/apple/config' ? config() : content('Track'), {
    authorize: async () => { authorizations++; return 'user-token'; },
    unauthorize: () => disconnect.promise
  });
  await client.click('#apple-prepare'); await client.click('#apple-authorize');
  const pending = client.click('#apple-disconnect');
  assert.equal(client.element('#apple-items').html, '');
  for (const selector of ['#apple-prepare', '#apple-authorize', '#apple-disconnect']) assert.equal(client.element(selector).disabled, true);
  await client.click('#apple-authorize'); await client.click('#apple-prepare');
  assert.equal(authorizations, 1);
  disconnect.resolve(); await pending;
  assert.equal(client.element('#apple-authorize').disabled, false);
  await client.click('#apple-authorize');
  assert.equal(authorizations, 2);
  assert.match(client.element('#apple-status').textContent, /Recent content loaded/);
});

test('Apple disconnect completion is ignored after pagehide', async () => {
  const disconnect = deferred();
  const client = harness(async url => url === '/api/apple/config' ? config() : content('Track'), { unauthorize: () => disconnect.promise });
  await client.click('#apple-prepare'); await client.click('#apple-authorize');
  const pending = client.click('#apple-disconnect');
  client.events.get('pagehide')();
  disconnect.resolve(); await pending;
  assert.doesNotMatch(client.element('#apple-status').textContent, /^Disconnected/);
});

test('Apple SDK timeouts require safe recovery and never accept late SDK results', async () => {
  for (const stage of ['configure', 'authorize', 'unauthorize']) {
    const delayed = deferred();
    const client = harness(async url => url === '/api/apple/config' ? config() : content('Track'), stage === 'configure' ? {} : { [stage]: () => delayed.promise });
    let pending;
    if (stage === 'configure') {
      client.window.MusicKit.configure = () => delayed.promise;
      pending = client.click('#apple-prepare');
    } else {
      await client.click('#apple-prepare');
      if (stage === 'unauthorize') await client.click('#apple-authorize');
      pending = client.click(stage === 'authorize' ? '#apple-authorize' : '#apple-disconnect');
    }
    await new Promise(resolve => setImmediate(resolve));
    client.timeout(20000); await pending;
    assert.match(client.element('#apple-status').textContent, /Reload this preview/);
    assert.equal(client.element('#apple-recover').hidden, false);
    assert.equal(client.element('#apple-prepare').disabled, true);
    assert.equal(client.element('#apple-authorize').disabled, true);
    delayed.resolve('late-user-token');
    await new Promise(resolve => setImmediate(resolve));
    assert.match(client.element('#apple-status').textContent, /Reload this preview/);
    assert.equal(client.element('#apple-prepare').disabled, true);
  }
});

test('Apple cached-page restoration clears preview and allows only explicit reconnection', async () => {
  let requests = 0;
  const client = harness(async url => { requests++; return url === '/api/apple/config' ? config() : content('Track'); });
  await client.click('#apple-prepare'); await client.click('#apple-authorize');
  assert.match(client.element('#apple-items').html, /Track/);
  client.events.get('pagehide')();
  client.events.get('pageshow')({ persisted: true });
  assert.equal(requests, 2);
  assert.equal(client.element('#apple-items').html, '');
  assert.equal(client.element('#apple-refresh').hidden, true);
  assert.equal(client.element('#apple-prepare').disabled, false);
  assert.match(client.element('#apple-status').textContent, /reconnect explicitly/);
  await client.click('#apple-authorize');
  assert.equal(requests, 3);
});

test('Apple interrupted SDK operation remains locked after cached-page restoration', async () => {
  const delayed = deferred();
  const client = harness(async () => config());
  client.window.MusicKit.configure = () => delayed.promise;
  const pending = client.click('#apple-prepare');
  await new Promise(resolve => setImmediate(resolve));
  client.events.get('pagehide')(); client.events.get('pageshow')({ persisted: true });
  assert.equal(client.element('#apple-recover').hidden, false);
  assert.equal(client.element('#apple-prepare').disabled, true);
  delayed.resolve(); await pending;
  assert.equal(client.element('#apple-prepare').disabled, true);
  assert.match(client.element('#apple-status').textContent, /interrupted/);
});