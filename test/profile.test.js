import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileStore } from '../profile.js';

function fixture() {
  const documents = new Map();
  const sdk = {
    doc: (_, ...path) => path.join('/'), serverTimestamp: () => 123,
    getDocFromServer: async path => ({ exists: () => documents.has(path), data: () => documents.get(path) }),
    runTransaction: async (_, task) => {
      const writes = [];
      const result = await task({ get: sdk.getDocFromServer, set: (path, value) => writes.push([path, value]) });
      for (const [path, value] of writes) documents.set(path, value);
      return result;
    }
  };
  return { sdk, documents, account: { uid: 'one', email: 'one@example.com' } };
}
test('profile repair creates only a missing profile with bounded names and no role', async () => {
  const { sdk, documents, account } = fixture();
  const store = createProfileStore(sdk, {}, account);
  assert.equal(await store.exists(), false);
  await assert.rejects(store.finish(' ', 'User'), /Enter first/);
  await assert.rejects(store.finish('a'.repeat(101), 'User'), /100/);
  assert.equal(documents.size, 0);
  assert.equal(await store.finish(' First ', ' Last '), true);
  assert.deepEqual(documents.get('users/one'), { firstName: 'First', lastName: 'Last', email: account.email, createdAt: 123 });
  assert.equal(await store.exists(), true);
});
test('profile repair preserves a concurrently created profile and admin role byte for byte', async () => {
  const { sdk, documents, account } = fixture();
  const store = createProfileStore(sdk, {}, account);
  assert.equal(await store.exists(), false);
  const existing = { firstName: 'Existing', role: 'admin', extra: ['untouched'] };
  documents.set('users/one', existing);
  assert.equal(await store.finish('New', 'Name'), false);
  assert.equal(documents.get('users/one'), existing);
});
test('account changes discard profile reads and abort repair before writes', async () => {
  const { sdk, documents, account } = fixture();
  let current = true;
  const read = sdk.getDocFromServer;
  sdk.getDocFromServer = async path => { const value = await read(path); current = false; return value; };
  const store = createProfileStore(sdk, {}, account, () => current);
  await assert.rejects(store.exists(), /Account changed/);
  current = true;
  await assert.rejects(store.finish('First', 'Last'), /Account changed/);
  assert.equal(documents.size, 0);
});