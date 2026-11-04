import test from 'node:test';
import assert from 'node:assert/strict';
import { zipEntries, readEntry, fileSources, MAX_BYTES } from '../importer.js';
import { makeZip } from './zip-fixture.js';

for (const method of [0, 8]) test(`reads ZIP method ${method} with nested JSON paths`, async () => {
  const zip = makeZip({ 'history/Streaming_History_Audio.json': '[{"test":1}]', 'readme.txt': 'ignored' }, { method });
  const entries = zipEntries(zip); assert.equal(entries.length, 1);
  assert.equal(await readEntry(entries[0]), '[{"test":1}]');
});
test('rejects truncated, empty, encrypted and unsupported archives', () => {
  assert.throws(() => zipEntries(new ArrayBuffer(4)), /Invalid/);
  assert.throws(() => zipEntries(makeZip({ 'readme.txt': 'none' })), /No JSON/);
  assert.throws(() => zipEntries(makeZip({ 'a.json': '[]' }, { flags: 1 })), /Encrypted/);
  assert.throws(() => zipEntries(makeZip({ 'a.json': '[]' }, { method: 12 })), /compression/);
});
test('rejects inflated declared sizes before decompression', () => {
  const zip = makeZip({ 'a.json': '[]' }); const view = new DataView(zip);
  const start = view.getUint32(zip.byteLength - 6, true); view.setUint32(start + 24, MAX_BYTES + 1, true);
  assert.throws(() => zipEntries(zip), /Expanded JSON/);
});
test('rejects CRC mismatches and actual data larger than declared size', async () => {
  const [entry] = zipEntries(makeZip({ 'a.json': '[1,2,3]' }));
  await assert.rejects(readEntry({ ...entry, crc: 0 }), /integrity/);
  await assert.rejects(readEntry({ ...entry, size: 1 }), /declared size/);
});
test('supports plain JSON and skips ZIP resource forks', async () => {
  const file = new File(['[]'], 'a.json'); const sources = await fileSources(file);
  assert.equal(await sources[0].read(), '[]');
  assert.equal(zipEntries(makeZip({ '__MACOSX/._a.json': 'ignore', 'a.json': '[]' })).length, 1);
  await assert.rejects(fileSources(new File(['x'], 'a.csv')), /JSON file or ZIP/);
});
test('honors cancellation before decompression', async () => {
  const controller = new AbortController(); controller.abort();
  const [entry] = zipEntries(makeZip({ 'a.json': '[]' }));
  await assert.rejects(readEntry(entry, controller.signal), { name: 'AbortError' });
});