import test from 'node:test';
import assert from 'node:assert/strict';
import { emailActionSettings, profileDetails, readWithTimeout, validateNewPassword } from '../account-utils.js';

test('account read timeout releases callers and safely ignores late settlement', async () => {
  let resolve;
  const late = new Promise(done => { resolve = done; });
  await assert.rejects(readWithTimeout(late, 5), { code: 'account/read-timeout' });
  resolve('late value');
  assert.equal(await readWithTimeout(Promise.resolve('retry'), 20), 'retry');
  await assert.rejects(readWithTimeout(Promise.reject(new Error('offline')), 20), /offline/);
});
test('password validation rejects weak, mismatching and cross-app whitespace passwords', () => {
  assert.throws(() => validateNewPassword('short', 'short'), /12/);
  assert.throws(() => validateNewPassword('long-password ', 'long-password '), /spaces/);
  assert.throws(() => validateNewPassword('long-password', 'different'), /match/);
  assert.doesNotThrow(() => validateNewPassword('valid-password-123', 'valid-password-123'));
});
test('email action returns are fixed same-origin routes without sensitive state', () => {
  assert.deepEqual(emailActionSettings('https://example.com/path?token=secret', 'verify'), { url: 'https://example.com/account?emailAction=verify', handleCodeInApp: false });
  assert.equal(emailActionSettings('http://localhost:3000', 'reset').url, 'http://localhost:3000/account?emailAction=reset');
  assert.throws(() => emailActionSettings('https://example.com', '//elsewhere'), /Unsupported/);
  assert.throws(() => emailActionSettings('file:///tmp', 'reset'), /origin/);
});
test('profile completeness distinguishes missing, malformed and complete names without exposing roles', () => {
  assert.equal(profileDetails(null).state, 'missing');
  assert.equal(profileDetails({ firstName: ' ', lastName: 'User' }).state, 'incomplete');
  assert.equal(profileDetails({ firstName: 123, lastName: 'User' }).state, 'incomplete');
  assert.deepEqual(profileDetails({ firstName: 'First', lastName: 'Last', email: 'a@example.com', role: 'admin' }), { state: 'complete', firstName: 'First', lastName: 'Last', email: 'a@example.com' });
});