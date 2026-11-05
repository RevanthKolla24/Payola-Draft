import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:3001';
const browser = await chromium.launch();
// Mock only the Firebase adapter. Exercise real UI, session codec and store.
const adapter = `
export async function connectFirebase() {
  let callback;
  const user = { uid: 'test-user', email: 'test@example.com', emailVerified: true };
  const auth = { currentUser: localStorage.getItem('test:remembered') ? user : null };
  window.testAuthChange = next => { auth.currentUser = next; callback(next); };
  const dbSDK = {
    doc: (_, ...path) => path.join('/'), serverTimestamp: () => Date.now(),
    setDoc: async () => { throw new Error('Simulated profile failure'); },
    getDocFromServer: async path => { if (window.testReadDelay) await new Promise(resolve => setTimeout(resolve, window.testReadDelay)); const data = JSON.parse(localStorage.getItem('cloud:' + path) || 'null'); return { exists: () => data !== null, data: () => data }; },
    runTransaction: async (_, fn) => {
      if (window.testWriteFailure) throw new Error('Simulated lost response');
      if (window.testWriteDelay) await new Promise(resolve => setTimeout(resolve, window.testWriteDelay));
      const pending = [];
      const result = await fn({ get: dbSDK.getDocFromServer, set: (path, data) => pending.push([path, data]) });
      for (const [path, data] of pending) localStorage.setItem('cloud:' + path, JSON.stringify(data));
      return result;
    }
  };
  const authSDK = {
    browserLocalPersistence: {}, inMemoryPersistence: {}, setPersistence: async () => {},
    onAuthStateChanged: (_, cb) => { callback = cb; cb(auth.currentUser); },
    signInWithEmailAndPassword: async () => { await new Promise(resolve => setTimeout(resolve, 100)); auth.currentUser = user; callback(user); return { user }; },
    createUserWithEmailAndPassword: async () => { user.emailVerified = false; auth.currentUser = user; callback(user); return { user }; },
    updateProfile: async () => {},
    signOut: async () => { auth.currentUser = null; callback(null); },
    reload: async target => { target.emailVerified = true; }, getIdToken: async () => 'verified',
    sendPasswordResetEmail: async () => {}, sendEmailVerification: async () => {}
  };
  return { auth, authSDK, db: {}, dbSDK };
}`;
try {
  const context = await browser.newContext();
  const errors = [], requests = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => requests.push(request.url()));
  await context.route('**/api/accounts', route => route.fulfill({ json: { enabled: true, firebase: {} } }));
  await context.route('**/firebase-client.js', route => route.fulfill({ contentType: 'text/javascript', body: adapter }));
  const first = await context.newPage(); await first.goto(base);
  assert.equal(requests.some(url => url.includes('firebase-client') || url.includes('/api/accounts')), false, 'Guest must not connect to Firebase');
  async function signIn(page) {
    await page.locator('#accounts > summary').click();
    await page.locator('#account-connect').click();
    await page.locator('#account-email').fill('test@example.com');
    await page.locator('#account-reset').click();
    await page.waitForFunction(() => document.querySelector('#account-status').textContent.includes('reset email has been requested'));
    await page.locator('#account-password').fill('valid-password');
    await page.locator('[data-password-toggle="account-password"]').click();
    assert.equal(await page.locator('#account-password').getAttribute('type'), 'text');
    await page.locator('[data-password-toggle="account-password"]').click();
    assert.equal(await page.locator('#account-password').getAttribute('type'), 'password');
    await page.locator('#account-submit').click();
    assert.equal(await page.locator('#accounts').getAttribute('aria-busy'), 'true');
    assert.match(await page.locator('#account-status').textContent(), /Signing in/);
    await page.waitForFunction(() => !document.querySelector('#cloud-save').disabled);
  }
  await signIn(first);
  assert.match(await first.locator('#cloud-status').textContent(), /No saved/);
  assert.equal(await first.locator('#stat-plays').textContent(), '2,727');
  first.once('dialog', dialog => dialog.dismiss()); await first.locator('#cloud-save').click();
  assert.equal(await first.evaluate(() => localStorage.getItem('cloud:payolaUsers/test-user/state/current')), null);
  first.once('dialog', dialog => dialog.accept()); await first.locator('#cloud-save').click();
  await first.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('version 1'));
  assert.match(await first.locator('#cloud-dirty').textContent(), /matches/);
  await first.locator('#restore-session').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await first.waitForFunction(() => document.querySelector('#status').textContent.includes('Previous results are unchanged'));
  assert.match(await first.locator('#cloud-dirty').textContent(), /matches/, 'Rejected restore must not mark history dirty');
  const savedText = await first.evaluate(() => {
    const metadata = JSON.parse(localStorage.getItem('cloud:payolaUsers/test-user/state/current'));
    return Array.from({ length: metadata.chunks }, (_, i) => JSON.parse(localStorage.getItem('cloud:payolaUsers/test-user/chunks/' + i)).data).join('');
  });
  first.once('dialog', dialog => dialog.dismiss());
  await first.locator('#restore-session').setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await first.waitForFunction(() => !document.querySelector('#save-session').disabled);
  assert.match(await first.locator('#cloud-dirty').textContent(), /matches/, 'Cancelled restore must not mark history dirty');
  const second = await context.newPage(); await second.goto(base); await signIn(second);
  assert.match(await second.locator('#cloud-status').textContent(), /version 1/);
  await second.locator('[data-mode="manual"]').click();
  assert.equal(await second.locator('#cloud-save').isDisabled(), true, 'Empty manual history must not be saved');
  await second.locator('#manual-form [name="artist"]').fill('Cross-device Artist');
  await second.locator('#manual-form [name="plays"]').fill('500');
  await second.locator('#manual-form button').click();
  second.once('dialog', dialog => dialog.accept()); await second.locator('#cloud-save').click();
  await second.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('version 2'));
  first.once('dialog', dialog => dialog.accept()); await first.locator('#cloud-save').click();
  await first.waitForFunction(() => document.querySelector('#account-status').textContent.includes('another device'));
  assert.equal(await first.locator('#cloud-conflict').isVisible(), true);
  assert.equal(await first.locator('#cloud-save').isDisabled(), true);
  assert.equal(await first.locator('#stat-plays').textContent(), '2,727');
  first.once('dialog', dialog => dialog.dismiss()); await first.locator('#cloud-load').click();
  await first.waitForFunction(() => !document.querySelector('#cloud-load').disabled);
  assert.equal(await first.locator('#stat-plays').textContent(), '2,727');
  first.once('dialog', dialog => dialog.accept()); await first.locator('#cloud-load').click();
  await first.waitForFunction(() => document.querySelector('#stat-plays').textContent === '500');
  assert.match(await first.locator('#cloud-status').textContent(), /version 2/);
  assert.match(await first.locator('#history-warning').textContent(), /cloud snapshot/);
  assert.match(await first.locator('#history-details').textContent(), /Cloud snapshot/);
  assert.equal(await first.locator('#manual-form [name="plays"]').inputValue(), '500');
  await first.locator('.danger-zone > summary').click();
  first.once('dialog', dialog => dialog.accept()); await first.locator('#cloud-delete').click();
  await first.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('deleted'));
  assert.equal(await first.locator('#stat-plays').textContent(), '500');
  // Local work changes must refresh controls even without a history repaint.
  await first.evaluate(() => {
    window.testOriginalFileText = File.prototype.text;
    File.prototype.text = async function () { await new Promise(resolve => setTimeout(resolve, 600)); return window.testOriginalFileText.call(this); };
  });
  await first.locator('#restore-session').setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  assert.equal(await first.locator('#cloud-load').isDisabled(), true);
  await first.waitForFunction(() => !document.querySelector('#cloud-load').disabled);
  await first.evaluate(() => { File.prototype.text = window.testOriginalFileText; });
  assert.equal(await first.evaluate(() => JSON.parse(localStorage.getItem('cloud:payolaUsers/test-user/chunks/0')).data), '');
  await first.locator('#account-signout').click();
  await first.waitForFunction(() => document.querySelector('#cloud-controls').hidden);
  assert.equal(await first.locator('#stat-plays').textContent(), '500');
  // A remembered identity checks cloud status as soon as the user connects.
  await first.evaluate(() => localStorage.setItem('test:remembered', 'yes'));
  const remembered = await context.newPage(); await remembered.goto(base);
  assert.equal(await remembered.locator('#accounts').getAttribute('open'), null);
  await remembered.locator('#accounts > summary').focus(); await remembered.keyboard.press('Enter');
  await remembered.locator('#account-connect').click();
  await remembered.waitForFunction(() => !document.querySelector('#cloud-save').disabled);
  assert.match(await remembered.locator('#cloud-status').textContent(), /No saved/);
  assert.match(await remembered.locator('#account-badge').textContent(), /Signed in/);
  await first.evaluate(() => localStorage.removeItem('test:remembered'));
  // Registration warning survives the later verification-success message.
  const signup = await context.newPage(); await signup.goto(base);
  await signup.locator('#accounts > summary').click(); await signup.locator('#account-connect').click();
  await signup.locator('#account-action').selectOption('signup');
  await signup.locator('#account-email').fill('new@example.com');
  await signup.locator('#account-password').fill('strong-password');
  await signup.locator('#account-confirm').fill('strong-password');
  await signup.locator('#account-first').fill('New'); await signup.locator('#account-last').fill('User');
  await signup.locator('#account-submit').click();
  await signup.waitForFunction(() => document.querySelector('#account-status').textContent.includes('do not register again'));
  assert.match(await signup.locator('#account-status').textContent(), /Verify your email/);
  assert.equal(await signup.locator('#account-password').inputValue(), '');
  assert.equal(await signup.locator('#account-verify').isVisible(), true);
  await signup.locator('#account-refresh').click();
  await signup.waitForFunction(() => document.querySelector('#cloud-controls').hidden === false && document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  assert.match(await signup.locator('#account-badge').textContent(), /Signed in/);
  // A slow cloud load cannot replace an edited local view.
  await second.locator('#cloud-check').click();
  await second.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  second.once('dialog', dialog => dialog.accept()); await second.locator('#cloud-save').click();
  await second.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  await second.evaluate(() => { window.testReadDelay = 500; });
  await second.locator('#cloud-load').click();
  await second.locator('#manual-form [name="plays"]').fill('600');
  await second.locator('#manual-form button').click();
  await second.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  assert.match(await second.locator('#account-status').textContent(), /Local view changed/);
  assert.equal(await second.locator('#stat-plays').textContent(), '600');
  await second.evaluate(() => { window.testReadDelay = 0; });
  // Metadata repair is explicit, bounded and leaves the local view alone.
  await second.evaluate(() => localStorage.setItem('cloud:payolaUsers/test-user/state/current', JSON.stringify({ version: 10, schema: 999 })));
  await second.locator('#cloud-check').click();
  await second.waitForFunction(() => document.querySelector('#account-status').textContent.includes('damaged'));
  assert.equal(await second.locator('#cloud-save').isDisabled(), true);
  await second.locator('.danger-zone > summary').click();
  second.once('dialog', dialog => dialog.accept()); await second.locator('#cloud-delete').click();
  await second.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('deleted'));
  assert.equal(await second.evaluate(() => JSON.parse(localStorage.getItem('cloud:payolaUsers/test-user/state/current')).version), 11);
  assert.equal(await second.locator('#stat-plays').textContent(), '600');
  // Sign-out clearing is opt-in and never deletes the account's snapshot.
  await second.evaluate(() => localStorage.setItem('payola-lastfm-user', 'private-user'));
  await second.locator('#account-clear-signout').check();
  second.once('dialog', dialog => dialog.accept()); await second.locator('#account-signout').click();
  await second.waitForFunction(() => document.querySelector('#cloud-controls').hidden);
  assert.equal(await second.locator('#stat-plays').textContent(), '0');
  assert.equal(await second.evaluate(() => localStorage.getItem('payola-lastfm-user')), null);
  // A delayed write stays single-flight and only marks its captured revision saved.
  await remembered.locator('#cloud-check').click();
  await remembered.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  await remembered.evaluate(() => { window.testWriteFailure = true; });
  remembered.once('dialog', dialog => dialog.accept()); await remembered.locator('#cloud-save').click();
  await remembered.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  assert.equal(await remembered.locator('#cloud-save').isDisabled(), true);
  assert.match(await remembered.locator('#cloud-status').textContent(), /not confirmed/);
  await remembered.evaluate(() => { window.testWriteFailure = false; });
  await remembered.locator('#cloud-check').click();
  await remembered.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  await remembered.evaluate(() => { window.testWriteDelay = 13000; });
  remembered.once('dialog', dialog => dialog.accept()); await remembered.locator('#cloud-save').click();
  await remembered.locator('[data-mode="manual"]').click();
  await remembered.locator('#manual-form [name="artist"]').fill('Changed during save');
  await remembered.locator('#manual-form [name="plays"]').fill('99');
  await remembered.locator('#manual-form button').click();
  await remembered.waitForFunction(() => document.querySelector('#account-status').textContent.includes('taking longer'), { timeout: 15000 });
  assert.equal(await remembered.locator('#cloud-save').isDisabled(), true);
  await remembered.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  assert.match(await remembered.locator('#cloud-dirty').textContent(), /not saved/);
  assert.equal(await remembered.locator('#stat-plays').textContent(), '99');
  // An auth change during a read must never restore the previous account's view.
  await remembered.evaluate(() => { window.testReadDelay = 500; });
  await remembered.locator('#cloud-load').click();
  await remembered.evaluate(() => window.testAuthChange(null));
  await remembered.waitForFunction(() => document.querySelector('#accounts').getAttribute('aria-busy') === 'false');
  assert.equal(await remembered.locator('#cloud-controls').isVisible(), false);
  assert.equal(await remembered.locator('#stat-plays').textContent(), '99');
  for (const width of [320, 390, 768, 1440]) {
    await second.setViewportSize({ width, height: 1000 });
    assert.ok(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
    await remembered.setViewportSize({ width, height: 1000 });
    assert.ok(await remembered.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Remembered layout overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: guest isolation, sign-in/reset/verification refresh, password toggles, explicit/remembered sign-in, cancelled/rejected restores, restore busy state and labels, empty save prevention, save/load/delete, conflict controls, damaged metadata recovery, delayed single-flight writes, local edits and auth changes during cloud work, partial registration warning, sign-out retention/clearing and four responsive widths (mocked Firebase adapter).');
} finally { await browser.close(); }