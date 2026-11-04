import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCloud, decodeCloud, createCloudStore, MAX_CLOUD_BYTES, validCloudMeta } from '../cloud.js';
import { sessionText } from '../session.js';
import { accountConfiguration } from '../firebase-config.js';
const text = artist => sessionText({ mode: 'manual', selectedService: 'spotify', records: [], filters: { from: '', to: '' }, duplicates: 0, manual: { artist, plays: 10 } });
function fakeSDK() {
  const documents = new Map();
  const sdk = {
    doc: (_, ...path) => path.join('/'), serverTimestamp: () => 123,
    getDocFromServer: async path => ({ exists: () => documents.has(path), data: () => documents.get(path) }),
    runTransaction: async (_, fn) => {
      const writes = new Map();
      const version = await fn({ get: sdk.getDocFromServer, set: (path, data) => writes.set(path, data) });
      for (const entry of writes) documents.set(...entry);
      return version;
    }
  };
  return { sdk, documents };
}
test('cloud round trip preserves Unicode and validates session size and chunk generations', () => {
  const original = text('🎵 Artist');
  const encoded = encodeCloud(original);
  const meta = { schema: 1, version: 1, deleted: false, chunks: encoded.chunks.length, bytes: encoded.bytes };
  assert.equal(decodeCloud(meta, encoded.chunks.map(data => ({ version: 1, data }))), original);
  assert.throws(() => decodeCloud(meta, [{ version: 2, data: original }]), /incomplete/);
  assert.throws(() => validCloudMeta({ ...meta, chunks: 17 }), /Unsupported/);
  assert.throws(() => encodeCloud(' '.repeat(MAX_CLOUD_BYTES) + original), /4 MiB/);
  const large = JSON.parse(original); large.mode = 'import'; large.manual = null;
  large.records = Array.from({ length: 2200 }, () => ({ date: '2026-01-01', ms: 60000, artist: '🎵'.repeat(250), track: '🎵'.repeat(500), supported: true }));
  assert.throws(() => encodeCloud(JSON.stringify(large)), /4 MiB/);
  large.records.length = 200;
  const unicodeText = JSON.stringify(large), unicodeChunks = encodeCloud(unicodeText);
  assert.ok(unicodeChunks.chunks.length > 1);
  assert.equal(decodeCloud({ ...meta, chunks: unicodeChunks.chunks.length, bytes: unicodeChunks.bytes }, unicodeChunks.chunks.map(data => ({ version: 1, data }))), unicodeText);
});
test('cloud conflicts preserve saved data; deletion empties bounded chunks and prevents ABA overwrite', async () => {
  const { sdk, documents } = fakeSDK();
  const first = createCloudStore(sdk, {}, 'one'), second = createCloudStore(sdk, {}, 'one');
  assert.equal(await first.status(), null);
  assert.equal(await first.save(text('First'), 0), 1);
  await assert.rejects(second.save(text('Stale'), 0), /another device/);
  assert.equal((await first.load()).text, text('First'));
  assert.equal(await second.save(text('Second'), 1), 2);
  await assert.rejects(first.remove(1), /another device/);
  assert.equal(await first.remove(2), 3);
  assert.equal((await first.status()).deleted, true);
  for (let i = 0; i < 16; i++) assert.equal(documents.get(`payolaUsers/one/chunks/${i}`).data, '');
  await assert.rejects(first.load(), /No saved/);
  await assert.rejects(second.save(text('Old'), 0), /another device/);
  assert.equal(await first.save(text('New'), 3), 4);
  assert.equal((await first.load()).text, text('New'));
  assert.equal(await createCloudStore(sdk, {}, 'two').status(), null);
});
test('account changes stop cloud work before any write', async () => {
  const { sdk, documents } = fakeSDK();
  const store = createCloudStore(sdk, {}, 'one', () => false);
  await assert.rejects(store.save(text('No'), 0), /Account changed/);
  assert.equal(documents.size, 0);
});
test('public account configuration is opt-in, bounded, and excludes unrelated secrets', () => {
  const env = { ENABLE_FIREBASE_ACCOUNTS: 'true', FIREBASE_API_KEY: 'AIza' + 'x'.repeat(30), FIREBASE_APP_ID: '1:123:web:abc123', PRIVATE_KEY: 'secret' };
  assert.equal(accountConfiguration({}), null);
  assert.equal(accountConfiguration({ ...env, FIREBASE_API_KEY: '' }), null);
  assert.equal(accountConfiguration(env).projectId, 'job-tracker-project-c4e87');
  assert.ok(!JSON.stringify(accountConfiguration(env)).includes('secret'));
});