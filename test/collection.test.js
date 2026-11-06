import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptStore, validateReceipt, receiptSVG, EMPTY_RECEIPT } from '../collection.js';

const receipt = { ...EMPTY_RECEIPT, title: 'Summer', source: 'Spotify · self-reported', disclosure: 'Estimate, not verified earnings.', theme: 'paper' };
function fixture(current = () => true, timeout = 12000) {
  const documents = new Map();
  const sdk = {
    doc: (_, ...path) => path.join('/'), serverTimestamp: () => 123,
    getDocFromServer: async path => ({ exists: () => documents.has(path), data: () => documents.get(path) }),
    runTransaction: async (_, fn) => fn({ get: sdk.getDocFromServer, set: (path, data) => documents.set(path, data) })
  };
  return { documents, sdk, store: createReceiptStore(sdk, {}, 'alice', current, timeout) };
}
test('receipt summaries reject raw history, unsupported fields, invalid themes and oversized notes', () => {
  assert.deepEqual(validateReceipt(receipt), receipt);
  for (const bad of [{ ...receipt, records: [] }, { ...receipt, note: 'x'.repeat(501) }, { ...receipt, title: ' ' }, { ...receipt, theme: 'html' }, { ...receipt, source: '\u0000' }]) assert.throws(() => validateReceipt(bad));
});
test('bounded collection saves, edits, conflicts, deletes and reuses tombstones', async () => {
  const { store, documents } = fixture();
  assert.equal((await store.list()).length, 20);
  assert.equal(await store.save(0, 0, receipt), 1);
  assert.equal((await store.list())[0].receipt.title, 'Summer');
  assert.equal(await store.save(0, 1, { ...receipt, title: 'Renamed' }), 2);
  await assert.rejects(store.save(0, 1, receipt), /another device/);
  await assert.rejects(store.save(20, 0, receipt), /slot/);
  assert.equal(await store.remove(0, 2), 3);
  assert.deepEqual(documents.get('payolaUsers/alice/receipts/0').receipt, {});
  assert.equal(await store.save(0, 3, receipt), 4);
  assert.equal(documents.size, 1);
});
test('collection guards stale identities and rejects corrupt entries', async () => {
  let active = true; const { store, sdk, documents } = fixture(() => active);
  const read = sdk.getDocFromServer;
  sdk.getDocFromServer = async path => { active = false; return read(path); };
  await assert.rejects(store.list(), /Account changed/);
  await assert.rejects(store.save(0, 0, receipt), /Account changed/);
  active = true; sdk.getDocFromServer = read;
  documents.set('payolaUsers/alice/receipts/0', { schema: 99 });
  await assert.rejects(store.list(), /Unsupported/);
});
test('all 20 slots remain bounded and a stale transaction cannot write into an old identity', async () => {
  let active = true; const { store, sdk, documents } = fixture(() => active);
  for (let slot = 0; slot < 20; slot++) await store.save(slot, 0, receipt);
  assert.equal((await store.list()).filter(entry => !entry.deleted).length, 20);
  const read = sdk.getDocFromServer;
  sdk.getDocFromServer = async path => { const snapshot = await read(path); active = false; return snapshot; };
  await assert.rejects(store.save(0, 1, { ...receipt, title: 'Stale update' }), /Account changed/);
  assert.equal(documents.get('payolaUsers/alice/receipts/0').receipt.title, 'Summer');
});
test('collection reads time out without exposing late results', async () => {
  const { store, sdk } = fixture(() => true, 5);
  sdk.getDocFromServer = () => new Promise(() => {});
  await assert.rejects(store.list(), /timed out/);
});
test('download is an escaped self-contained SVG with preserved disclosures', () => {
  const svg = receiptSVG({ ...receipt, title: '<script>alert(1)</script>', note: 'Private & personal', theme: 'midnight' });
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('Private &amp; personal'));
  assert.ok(svg.includes('not verified earnings.'));
  assert.ok(svg.includes('not a full-history backup.'));
});