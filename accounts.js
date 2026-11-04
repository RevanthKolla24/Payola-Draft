import { createCloudStore } from './cloud.js';

const $ = selector => document.querySelector(selector);
const bounded = (promise, message, ms = 12000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
};
const messageFor = error => {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'This shared account already exists. Sign in instead, or reset your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password. The shared project password policy also applies.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/network-request-failed': 'Connection failed. Your local history is unchanged.',
    'auth/unauthorized-domain': 'This website is not authorized for the shared Firebase project. Ask the owner to add this hostname in Firebase Authentication settings.',
    'auth/operation-not-allowed': 'Email/password sign-in is disabled in the shared Firebase project. Ask the owner to enable it.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase web configuration is invalid. Ask the owner to check the project settings.',
    'auth/user-disabled': 'This shared account has been disabled. Contact the project owner.',
    'permission-denied': 'Cloud access denied. Verify your email, or ask the owner to check the deployed Firebase rules.',
    'resource-exhausted': 'Cloud quota reached. Download a local session and try again later.',
    'unavailable': 'Cloud is unavailable. Your local history is unchanged.'
  };
  return messages[error.code] || error.message || 'Account operation failed. Local history is unchanged.';
};

export function initAccounts({ capture, restore, localBusy, canSave }) {
  let client, user = null, store, working = false, epoch = 0, cloudVersion = null;
  let localRevision = 0, savedRevision = -1;
  let identity = null;
  const status = text => { $('#account-status').textContent = text; };
  const cloudStatus = text => { $('#cloud-status').textContent = text; };
  const currentUID = () => user?.uid;
  function render() {
    $('#accounts').setAttribute('aria-busy', String(working));
    $('#account-badge').textContent = user ? user.emailVerified ? 'Signed in' : 'Verify email' : 'Optional · guest mode';
    $('#account-connect').hidden = Boolean(client);
    $('#account-forms').hidden = !client || Boolean(user);
    $('#account-user').hidden = !user;
    $('#cloud-controls').hidden = !user?.emailVerified;
    $('#account-verify').hidden = !user || user.emailVerified;
    $('#account-refresh').hidden = !user || user.emailVerified;
    $('#account-identity').textContent = user ? `${user.email} · ${user.emailVerified ? 'verified shared account' : 'email verification required'}` : '';
    document.querySelectorAll('#accounts button').forEach(button => { button.disabled = working; });
    document.querySelectorAll('#account-form input, #account-form select').forEach(input => { input.disabled = working; });
    $('#cloud-save').disabled = working || localBusy() || !canSave() || !user?.emailVerified || cloudVersion === null;
    $('#cloud-load').disabled = working || localBusy() || !user?.emailVerified;
    $('#cloud-delete').disabled = working || !user?.emailVerified || cloudVersion === null;
    $('#cloud-dirty').textContent = user?.emailVerified ? savedRevision === localRevision ? 'This view matches your last successful save/load in this tab.' : 'Local view is not saved. Cloud saves are explicit; there is no autosave.' : 'Guest mode remains local. Signing in does not upload or replace history.';
  }
  document.addEventListener('payola:view', event => {
    const next = event.detail;
    if (!identity || next.some((value, index) => !Object.is(value, identity[index]))) { localRevision++; identity = next; }
    render();
  });
  async function run(task, pending = 'Working…') {
    if (working) return;
    working = true; status(pending); render();
    try { await task(); } catch (error) { status(messageFor(error)); }
    finally {
      if ($('#account-status').textContent === pending) status('Ready. Your local history is unchanged.');
      working = false; render();
    }
  }
  async function checkCloud() {
    if (!store) return;
    const target = store, versionEpoch = epoch;
    const meta = await target.status();
    if (versionEpoch !== epoch) return;
    cloudVersion = meta?.version || 0;
    cloudStatus(meta && !meta.deleted ? `Cloud snapshot available · version ${meta.version} · ${(meta.bytes / 1048576).toFixed(2)} MiB. Load to view, or Save to explicitly replace it.` : 'No saved Payola history. Your jobs are separate and unchanged.');
  }
  function changed(next) {
    epoch++; user = next; cloudVersion = null; savedRevision = -1;
    const uid = next?.uid, versionEpoch = epoch;
    store = next?.emailVerified ? createCloudStore(client.dbSDK, client.db, uid, () => epoch === versionEpoch && currentUID() === uid) : null;
    cloudStatus('Check cloud status before saving.');
    render();
  }
  $('#account-connect').addEventListener('click', () => run(async () => {
    const response = await fetch('/api/accounts', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const config = await response.json();
    if (!response.ok || !config.enabled) throw new Error('Account sign-in is disabled by this deployment’s settings. The owner must remove ENABLE_FIREBASE_ACCOUNTS=false and any blank Firebase overrides on Render, then redeploy. Guest mode still works.');
    const { connectFirebase } = await import('./firebase-client.js');
    client = await connectFirebase(config.firebase);
    client.authSDK.onAuthStateChanged(client.auth, next => {
      if (next?.uid === user?.uid && Boolean(next?.emailVerified) === Boolean(user?.emailVerified)) return;
      changed(next);
      if (!working && store) run(checkCloud, 'Checking your cloud history…');
    });
    changed(client.auth.currentUser);
    status('Connected to the shared Job Tracker / Payola Draft account service. No history has been uploaded.');
    if (store) await checkCloud();
  }, 'Connecting account service…'));
  $('#account-action').addEventListener('change', () => {
    const signup = $('#account-action').value === 'signup';
    $('#account-name-fields').hidden = !signup;
    $('#account-first').required = signup; $('#account-last').required = signup; $('#account-confirm').required = signup;
    $('#account-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#account-password').minLength = signup ? 12 : 1;
    $('#account-submit').textContent = signup ? 'Create shared account' : 'Sign in';
  });
  $('#account-form').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const email = $('#account-email').value.trim(), password = $('#account-password').value;
      const signup = $('#account-action').value === 'signup';
      if (password !== password.trim()) throw new Error('Leading/trailing password spaces are not supported by Job Tracker. Use a password without them for shared sign-in.');
      if (signup && password !== $('#account-confirm').value) throw new Error('Passwords do not match.');
      const sdk = client.authSDK;
      await sdk.setPersistence(client.auth, $('#account-remember').checked ? sdk.browserLocalPersistence : sdk.inMemoryPersistence);
      if (signup) {
        const firstName = $('#account-first').value.trim(), lastName = $('#account-last').value.trim();
        if (!firstName || !lastName) throw new Error('Enter your first and last name.');
        const credential = await sdk.createUserWithEmailAndPassword(client.auth, email, password);
        // Do not overwrite existing profiles/roles. This is a newly-created identity.
        const warnings = [];
        try { await sdk.updateProfile(credential.user, { displayName: `${firstName} ${lastName}` }); }
        catch { warnings.push('Your account exists, but the display name could not be saved.'); }
        try {
          await bounded(client.dbSDK.setDoc(client.dbSDK.doc(client.db, 'users', credential.user.uid), { firstName, lastName, email, createdAt: client.dbSDK.serverTimestamp() }), 'Profile save is taking too long.');
        } catch { warnings.push('The optional Job Tracker profile was not confirmed saved; it may finish later. Your login exists; do not register again.'); }
        try {
          await sdk.sendEmailVerification(credential.user);
          status(`Shared account created. Verify your email using the link, then choose “I verified my email.” ${warnings.join(' ')}`);
        } catch {
          status(`Your shared account was created, but verification email delivery failed. Use Resend verification email; do not register again. ${warnings.join(' ')}`);
        }
      } else {
        await sdk.signInWithEmailAndPassword(client.auth, email, password);
        status(client.auth.currentUser.emailVerified ? 'Signed in. No history was uploaded or replaced.' : 'Signed in. Verify your email before using cloud saves.');
      }
      changed(client.auth.currentUser);
      $('#account-password').value = ''; $('#account-confirm').value = '';
      if (store) {
        try { await bounded(checkCloud(), 'Cloud status timed out. Check cloud status to retry.'); }
        catch (error) { cloudStatus(messageFor(error)); status('Signed in successfully. Cloud access needs attention; your local history is unchanged.'); }
      }
    }, $('#account-action').value === 'signup' ? 'Creating your shared account…' : 'Signing in…');
  });
  $('#account-reset').addEventListener('click', () => run(async () => {
    const email = $('#account-email').value.trim();
    if (!email) throw new Error('Enter your account email above first.');
    await client.authSDK.sendPasswordResetEmail(client.auth, email);
    status('If that address has an account, a reset email has been requested. Resetting this password affects both apps.');
  }));
  $('#account-verify').addEventListener('click', () => run(async () => { await client.authSDK.sendEmailVerification(user); status('Verification email requested. Check your inbox and spam folder.'); }));
  $('#account-refresh').addEventListener('click', () => run(async () => {
    await client.authSDK.reload(user); await client.authSDK.getIdToken(user, true); changed(client.auth.currentUser);
    status(user.emailVerified ? 'Email verified. Cloud controls are available.' : 'Email is not verified yet.');
    if (store) await checkCloud();
  }));
  $('#account-signout').addEventListener('click', () => run(async () => {
    await client.authSDK.signOut(client.auth); changed(null);
    status('Signed out on this website. The open local history remains in this tab; use Clear data or close it on a shared device. Job Tracker has its own sign-in session.');
  }));
  $('#cloud-check').addEventListener('click', () => run(async () => { await checkCloud(); status('Cloud status checked. Your local view is unchanged.'); }, 'Checking cloud status…'));
  $('#cloud-save').addEventListener('click', () => run(async () => {
    if (!store || localBusy() || cloudVersion === null) throw new Error('Finish pending work and check cloud status first.');
    const text = capture(), revision = localRevision, target = store;
    if (!window.confirm('Upload this normalized listening history, dates, tracks and source declarations to Firebase? This replaces this account’s Payola snapshot, not its jobs. Original import files and credentials are not uploaded.')) return;
    cloudVersion = await target.save(text, cloudVersion); savedRevision = revision;
    cloudStatus(`Saved to your account · version ${cloudVersion}. Use Load saved history on another device.`);
    status('Cloud save succeeded. Local downloads still work.');
  }, 'Saving your history…'));
  $('#cloud-load').addEventListener('click', () => run(async () => {
    if (!store || localBusy()) throw new Error('Finish pending work before loading.');
    const target = store, revision = localRevision;
    const loaded = await target.load();
    if (revision !== localRevision || localBusy()) throw new Error('Local view changed while loading. Retry; nothing was replaced.');
    if (!window.confirm('Replace the open view with your cloud snapshot? History remains user-editable, not verified. Last.fm dollar scenarios require a fresh opt-in.')) return;
    restore(loaded.text); cloudVersion = loaded.version; savedRevision = localRevision;
    cloudStatus(`Loaded cloud version ${loaded.version}.`); status('Saved history loaded. No histories were merged.');
  }, 'Loading saved history…'));
  $('#cloud-delete').addEventListener('click', () => run(async () => {
    if (!store || cloudVersion === null) throw new Error('Check cloud status first.');
    if (!window.confirm('Delete this account’s cloud Payola listening snapshot? This does not delete your local view, Job Tracker jobs, or the shared account.')) return;
    cloudVersion = await store.remove(cloudVersion); savedRevision = -1;
    cloudStatus('Cloud Payola history deleted. Local view and jobs are unchanged.');
    status('Cloud deletion succeeded. Your local view is unchanged.');
  }, 'Deleting cloud Payola history…'));
  render();
}