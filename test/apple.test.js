import test from 'node:test';
import assert from 'node:assert/strict';
import { developerConfiguration, recentItems, nextRecentPath, APPLE_RECENT_PATH } from '../apple.js';
const encode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
test('Apple config requires a non-expired developer token, not a bundled credential', () => {
  assert.throws(() => developerConfiguration(), /not configured/);
  assert.throws(() => developerConfiguration('bad'), /malformed/);
  const token = `${encode({ alg: 'ES256', kid: 'test' })}.${encode({ iss: 'team', exp: 2000 })}.signature`;
  assert.equal(developerConfiguration(token, 1000).developerToken, token);
  assert.throws(() => developerConfiguration(token, 1990), /expired/);
});
test('recent resources never become plays, timestamps, duration, or money', () => {
  const items = recentItems({ data: [{ id: '1', type: 'songs', attributes: { name: 'Track', artistName: 'Artist', albumName: 'Album', durationInMillis: 200000 } }, { id: 'bad' }] });
  assert.deepEqual(items, [{ id: '1', type: 'songs', title: 'Track', artist: 'Artist', album: 'Album' }]);
  assert.throws(() => recentItems({ nope: [] }), /Unexpected/);
});
test('pagination only permits the documented recent tracks endpoint on Apple', () => {
  assert.equal(nextRecentPath(`${APPLE_RECENT_PATH}?offset=10`), `${APPLE_RECENT_PATH}?offset=10`);
  assert.equal(nextRecentPath(null), null);
  for (const url of ['https://evil.test/v1/me/recent/played/tracks', '/v1/me/library/songs', '//evil.test/path']) assert.throws(() => nextRecentPath(url), /unsupported/);
});