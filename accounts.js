import { createCloudStore, encodeCloud, MAX_CLOUD_BYTES } from './cloud.js';
import { createProfileStore } from './profile.js';
import { emailActionSettings, validateNewPassword } from './account-utils.js';
import { initReceiptCollection } from './collection-ui.js';

const $ = selector => document.querySelector(selector);
const messageFor = error => {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'This shared account already exists. Sign in instead, or reset your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password. The shared project password policy also applies.',
    'auth/requires-recent-login': 'For your security, sign in again before changing your password.',
    'auth/invalid-continue-uri': 'The email return address is not configured correctly. Contact the project owner.',
    'auth/unauthorized-continue-uri': 'This website must be authorized in Firebase before email links can return here.',
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

export function initAccounts({ capture, restore, localBusy, canSave, clearLocal, preservation, captureReceipt, navigate }) {
  let client, user = null, store, working = false, epoch = 0, cloudVersion = null;
  let localRevision = 0, savedRevision = -1;
  let identity = null;
  let recovery = null;
  let authIdentity = '';
  let profileStore, profileMissing = false;
  let profile = null, queuedIdentity = false, cloudBytes = null, sizeError = '';
  let verificationUntil = 0, verificationTimer, lastVerificationCheck = 0;
  const collection = initReceiptCollection({ captureReceipt, navigate, localBusy, run, accountBusy: () => working });
  const status = text => { $('#account-status').textContent = text; };
  const cloudStatus = text => { $('#cloud-status').textContent = text; };
  const currentUID = () => user?.uid;
  const actionSettings = action => emailActionSettings(location.origin, action);
  const assertAccount = target => { if (!target || client.auth.currentUser?.uid !== target.uid || currentUID() !== target.uid) throw new Error('Account changed. Retry using the current account.'); };
  function clearSecrets() {
    document.querySelectorAll('#accounts input[data-secret]').forEach(input => { input.value = ''; input.type = 'password'; });
    document.querySelectorAll('[data-password-toggle]').forEach(button => { button.setAttribute('aria-pressed', 'false'); button.textContent = 'Show password'; });
  }
  function measureHistory() {
    cloudBytes = null; sizeError = '';
    if (!canSave() || localBusy()) return;
    try { cloudBytes = new TextEncoder().encode(capture()).length; }
    catch (error) { sizeError = messageFor(error); }
  }
  function render() {
    $('#accounts').setAttribute('aria-busy', String(working));
    $('#account-badge').textContent = user ? user.emailVerified ? 'Signed in' : 'Verify email' : 'Optional · guest mode';
    $('#account-connect').hidden = Boolean(client);
    $('#account-forms').hidden = !client || Boolean(user);
    $('#account-user').hidden = !user;
    $('#account-cloud-intro').hidden = Boolean(user);
    $('#account-guest-link').textContent = user ? 'Back to your listening →' : 'Continue without an account →';
    $('#account-security').hidden = !user;
    $('#account-edit-form').hidden = !user || !profile || profile.state === 'missing';
    $('#account-overview-name').textContent = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Finish your profile' : user ? 'Your shared account' : 'A home for your listening';
    $('#cloud-controls').hidden = !user?.emailVerified;
    $('#account-verify').hidden = !user || user.emailVerified;
    $('#account-refresh').hidden = !user || user.emailVerified;
    $('#account-identity').textContent = user ? `${user.email} · ${user.emailVerified ? 'verified shared account' : 'email verification required'}` : '';
    document.querySelectorAll('#accounts button').forEach(button => { button.disabled = working; });
    $('#account-edit-form [type="submit"]').disabled = working || profile?.email !== user?.email;
    document.querySelectorAll('#account-form input, #account-form select').forEach(input => { input.disabled = working; });
    document.querySelectorAll('#account-profile-form input').forEach(input => { input.disabled = working; });
    $('#account-profile-form').hidden = !user || !profileMissing;
    $('#cloud-save').disabled = working || localBusy() || !canSave() || !user?.emailVerified || cloudVersion === null || cloudBytes > MAX_CLOUD_BYTES || Boolean(sizeError);
    $('#cloud-load').disabled = working || localBusy() || !user?.emailVerified;
    $('#cloud-delete').disabled = working || !user?.emailVerified || (cloudVersion === null && !recovery);
    $('#cloud-delete').textContent = recovery ? 'Reset damaged Payola snapshot' : 'Delete cloud Payola history';
    $('#account-clear-signout').disabled = working || localBusy();
    $('#account-signout').disabled = working || ($('#account-clear-signout').checked && localBusy());
    $('#cloud-dirty').textContent = user?.emailVerified ? savedRevision === localRevision ? 'This view matches your last successful save/load in this tab.' : 'Local view is not saved. Cloud saves are explicit; there is no autosave.' : 'Guest mode remains local. Signing in does not upload or replace history.';
    $('#cloud-size').textContent = sizeError || (cloudBytes === null ? 'Add listening and finish pending work to check cloud eligibility.' : `Current session: ${(cloudBytes / 1048576).toFixed(2)} MiB / 4 MiB${cloudBytes > MAX_CLOUD_BYTES ? ' · Too large for cloud. Download a local session instead.' : ' · Fits cloud storage.'}`);
    const seconds = Math.max(0, Math.ceil((verificationUntil - Date.now()) / 1000));
    $('#account-verify').disabled = working || seconds > 0;
    $('#account-verify').textContent = seconds ? `Resend available in ${seconds}s` : 'Resend verification email';
    $('#account-verification-note').hidden = !user || user.emailVerified;
    $('#account-verification-note').textContent = user ? `Check ${user.email} for a verification link. Cloud saves unlock after verification; local listening stays available.` : '';
    document.querySelectorAll('#account-edit-form input, #account-security input').forEach(input => { input.disabled = working; });
    document.querySelectorAll('[data-auth-view]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.authView === $('#account-action').value)); });
    collection.render();
  }
  document.addEventListener('payola:view', event => {
    const next = event.detail;
    if (!identity || next.some((value, index) => !Object.is(value, identity[index]))) { localRevision++; identity = next; measureHistory(); }
    render();
  });
  document.addEventListener('payola:busy', () => { measureHistory(); render(); });
  $('#account-clear-signout').addEventListener('change', render);
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.textContent = `${show ? 'Hide' : 'Show'} ${input.id === 'account-confirm' ? 'confirmation password' : 'password'}`;
  }));
  async function run(task, pending = 'Working…') {
    if (working) return;
    let operationEpoch = epoch;
    const operation = {
      current: () => operationEpoch === epoch,
      assert: () => { if (operationEpoch !== epoch) throw new Error('Account changed. Retry using the current account.'); },
      adopt: () => { operationEpoch = epoch; }
    };
    working = true; status(pending); render();
    const timer = setTimeout(() => {
      if (operation.current()) status('This is taking longer than expected. A pending write may still complete; do not retry it in another tab. Local downloads remain available. Waiting for confirmation…');
    }, 12000);
    try { await task(operation); } catch (error) {
      if (!operation.current()) return;
      if (error.code === 'cloud/conflict') { cloudVersion = null; recovery = null; $('#cloud-conflict').hidden = false; }
      if (error.code === 'cloud/metadata') { cloudVersion = null; recovery = error.recovery; cloudStatus(messageFor(error)); }
      status(messageFor(error));
      if (!user) $('#account-form-error').textContent = messageFor(error);
    }
    finally {
      clearTimeout(timer);
      if (operation.current() && $('#account-status').textContent === pending) status('Ready. Your local history is unchanged.');
      working = false; render();
      if (queuedIdentity) {
        queuedIdentity = false;
        if (user) await run(async followup => { await checkProfile(); followup.assert(); if (store) await checkCloud(); }, 'Checking current account…');
      }
    }
  }
  async function checkCloud() {
    if (!store) return;
    const target = store, versionEpoch = epoch;
    cloudVersion = null; recovery = null;
    render();
    let meta;
    try { meta = await target.status(); } catch (error) {
      if (versionEpoch !== epoch) return;
      if (error.code === 'cloud/metadata') { cloudVersion = null; recovery = error.recovery; }
      cloudStatus(messageFor(error));
      throw error;
    }
    if (versionEpoch !== epoch) return;
    cloudVersion = meta?.version || 0;
    recovery = null;
    const savedAt = meta?.updatedAt?.toDate?.();
    cloudStatus(meta && !meta.deleted ? `Cloud snapshot available · version ${meta.version} · ${(meta.bytes / 1048576).toFixed(2)} MiB${savedAt instanceof Date && !Number.isNaN(savedAt.getTime()) ? ` · Saved ${savedAt.toLocaleString()}` : ''}. Load to view, or Save to explicitly replace it.` : 'No saved Payola history. Your jobs are separate and unchanged.');
  }
  async function checkProfile() {
    if (!profileStore) return;
    const target = profileStore, versionEpoch = epoch;
    profileMissing = false; profile = null;
    $('#account-profile-status').textContent = 'Checking shared profile setup…'; render();
    try {
      const details = await target.read();
      if (versionEpoch !== epoch) return;
      profile = details; profileMissing = details.state === 'missing';
      $('#edit-first').value = details.firstName; $('#edit-last').value = details.lastName;
      $('#account-profile-status').textContent = profileMissing ? 'Shared profile is missing. Your login works; finish setup below.' : details.email !== user.email ? 'Shared profile exists, but its email differs from your login. Contact the project owner; name editing is paused to avoid cross-app inconsistencies.' : details.state === 'incomplete' ? 'Shared profile is incomplete. Update your names below; roles and other fields stay unchanged.' : 'Shared profile exists. You can update your names below; roles and other fields stay unchanged.';
    } catch (error) {
      if (versionEpoch !== epoch) return;
      profile = null;
      $('#account-profile-status').textContent = `Profile setup could not be checked. Use Check shared profile setup to retry. ${messageFor(error)}`;
    }
    render();
  }
  $('#account-profile-check').addEventListener('click', () => run(checkProfile, 'Checking shared profile setup…'));
  $('#account-profile-form').addEventListener('submit', event => {
    event.preventDefault();
    run(async operation => {
      if (!profileStore || !profileMissing) throw new Error('Check shared profile setup first.');
      const target = profileStore, versionEpoch = epoch;
      const created = await target.finish($('#profile-first').value, $('#profile-last').value);
      if (versionEpoch !== epoch) return;
      profileMissing = false;
      $('#profile-first').value = ''; $('#profile-last').value = '';
      $('#account-profile-status').textContent = created ? 'Shared profile created. Account setup is complete.' : 'A shared profile already exists. Nothing was overwritten; setup is complete.';
      status('Shared profile setup complete. Your login and local history are unchanged.');
      await checkProfile();
      operation.assert();
    }, 'Finishing account setup…');
  });
  function changed(next) {
    const oldUID = user?.uid;
    authIdentity = `${next?.uid || ''}:${Boolean(next?.emailVerified)}:${next?.email || ''}`;
    epoch++; user = next; cloudVersion = null; savedRevision = -1; recovery = null;
    collection.changed(next, client);
    preservation.clearCloud();
    profileMissing = false;
    profile = null; clearSecrets();
    if (oldUID !== next?.uid || next?.emailVerified) { verificationUntil = 0; clearInterval(verificationTimer); }
    $('#account-email').value = ''; $('#account-remember').checked = false;
    $('#account-clear-signout').checked = false;
    $('#account-edit-status').textContent = ''; $('#account-security-status').textContent = '';
    $('#profile-first').value = ''; $('#profile-last').value = '';
    $('#account-profile-status').textContent = '';
    $('#cloud-conflict').hidden = true;
    const uid = next?.uid, versionEpoch = epoch;
    store = next?.emailVerified ? createCloudStore(client.dbSDK, client.db, uid, () => epoch === versionEpoch && currentUID() === uid) : null;
    profileStore = next ? createProfileStore(client.dbSDK, client.db, { uid, email: next.email }, () => epoch === versionEpoch && currentUID() === uid) : null;
    cloudStatus(next ? 'Check cloud status before saving.' : '');
    render();
  }
  $('#account-connect').addEventListener('click', () => run(async operation => {
    const response = await fetch('/api/accounts', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const config = await response.json();
    if (!response.ok || !config.enabled) throw new Error('Account sign-in is disabled by this deployment’s settings. The owner must remove ENABLE_FIREBASE_ACCOUNTS=false and any blank Firebase overrides on Render, then redeploy. Guest mode still works.');
    const { connectFirebase } = await import('./firebase-client.js');
    client = await connectFirebase(config.firebase);
    const observeAuth = client.authSDK.onIdTokenChanged || client.authSDK.onAuthStateChanged;
    observeAuth(client.auth, next => {
      if (`${next?.uid || ''}:${Boolean(next?.emailVerified)}:${next?.email || ''}` === authIdentity) return;
      changed(next);
      if (working) queuedIdentity = true;
      else if (next) run(async followup => { await checkProfile(); followup.assert(); if (store) await checkCloud(); }, 'Checking your account…');
    });
    changed(client.auth.currentUser);
    operation.adopt(); queuedIdentity = false;
    status('Connected to the shared Job Tracker / Payola Reciept account service. No history has been uploaded.');
    await checkProfile();
    operation.assert();
    if (store) await checkCloud();
  }, 'Connecting account service…'));
  function syncAuthView() {
    const signup = $('#account-action').value === 'signup';
    const reset = $('#account-action').value === 'reset';
    $('#account-name-fields').hidden = !signup;
    $('#account-first').required = signup; $('#account-last').required = signup; $('#account-confirm').required = signup;
    $('#account-password-fields').hidden = reset;
    $('#account-password').required = !reset;
    $('#account-remember').closest('label').hidden = reset;
    $('#account-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#account-password').minLength = signup ? 12 : 1;
    $('#account-submit').textContent = reset ? 'Send reset email' : signup ? 'Create shared account' : 'Sign in';
    $('#account-form-error').textContent = '';
    render();
  }
  $('#account-action').addEventListener('change', syncAuthView);
  document.querySelectorAll('[data-auth-view]').forEach(button => button.addEventListener('click', () => {
    $('#account-action').value = button.dataset.authView; clearSecrets(); syncAuthView(); $('#account-email').focus();
  }));
  async function requestReset(email, operation) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid account email address.');
    try { await client.authSDK.sendPasswordResetEmail(client.auth, email, actionSettings('reset')); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    operation.assert();
    status('If that address has an account, a reset email has been requested. Check your inbox and spam folder. Resetting this password affects both apps.');
  }
  function verificationCooldown() {
    verificationUntil = Date.now() + 60000;
    clearInterval(verificationTimer);
    verificationTimer = setInterval(() => { render(); if (Date.now() >= verificationUntil) clearInterval(verificationTimer); }, 1000);
  }
  $('#account-form').addEventListener('submit', event => {
    event.preventDefault();
    run(async operation => {
      const email = $('#account-email').value.trim(), password = $('#account-password').value;
      const signup = $('#account-action').value === 'signup';
      let verificationSent = false;
      $('#account-form-error').textContent = '';
      if ($('#account-action').value === 'reset') { await requestReset(email, operation); return; }
      if (password !== password.trim()) throw new Error('Leading/trailing password spaces are not supported by Job Tracker. Use a password without them for shared sign-in.');
      if (signup) validateNewPassword(password, $('#account-confirm').value);
      const sdk = client.authSDK;
      await sdk.setPersistence(client.auth, $('#account-remember').checked ? sdk.browserLocalPersistence : sdk.inMemoryPersistence);
      operation.assert();
      if (signup) {
        const firstName = $('#account-first').value.trim(), lastName = $('#account-last').value.trim();
        if (!firstName || !lastName) throw new Error('Enter your first and last name.');
        const credential = await sdk.createUserWithEmailAndPassword(client.auth, email, password);
        assertAccount(credential.user); operation.adopt();
        // Do not overwrite existing profiles/roles. This is a newly-created identity.
        const warnings = [];
        try { await sdk.updateProfile(credential.user, { displayName: `${firstName} ${lastName}` }); }
        catch { warnings.push('Your account exists, but the display name could not be saved.'); }
        operation.assert();
        try {
          const target = credential.user;
          await createProfileStore(client.dbSDK, client.db, { uid: target.uid, email }, () => operation.current() && client.auth.currentUser?.uid === target.uid).finish(firstName, lastName);
        } catch { warnings.push('The optional Job Tracker profile was not confirmed saved; it may finish later. Your login exists; do not register again.'); }
        operation.assert();
        try {
          assertAccount(credential.user);
          await sdk.sendEmailVerification(credential.user, actionSettings('verify'));
          operation.assert(); verificationSent = true;
          status(`Shared account created. Verify your email using the link, then choose “I verified my email.” ${warnings.join(' ')}`);
        } catch {
          operation.assert();
          status(`Your shared account was created, but verification email delivery failed. Use Resend verification email; do not register again. ${warnings.join(' ')}`);
        }
      } else {
        const credential = await sdk.signInWithEmailAndPassword(client.auth, email, password);
        assertAccount(credential.user); operation.adopt();
        status(client.auth.currentUser.emailVerified ? 'Signed in. No history was uploaded or replaced.' : 'Signed in. Verify your email before using cloud saves.');
      }
      changed(client.auth.currentUser); queuedIdentity = false;
      operation.adopt();
      if (verificationSent) verificationCooldown();
      clearSecrets();
      await checkProfile();
      operation.assert();
      if (store) {
        try { await checkCloud(); }
        catch (error) { operation.assert(); cloudStatus(messageFor(error)); status('Signed in successfully. Cloud access needs attention; your local history is unchanged.'); }
      }
    }, $('#account-action').value === 'signup' ? 'Creating your shared account…' : $('#account-action').value === 'reset' ? 'Requesting password recovery…' : 'Signing in…');
  });
  $('#account-reset').addEventListener('click', () => run(async operation => {
    await requestReset($('#account-email').value.trim(), operation);
  }));
  $('#account-security-reset').addEventListener('click', () => run(async operation => { if (user) await requestReset(user.email, operation); }));
  $('#account-verify').addEventListener('click', () => run(async operation => {
    if (!user || Date.now() < verificationUntil) return;
    const target = user;
    await client.authSDK.sendEmailVerification(target, actionSettings('verify')); operation.assert(); assertAccount(target);
    verificationCooldown(); status('Verification email requested. Check your inbox and spam folder.');
  }));
  async function refreshVerification(operation) {
    const target = user;
    if (!target) return;
    const cooldown = verificationUntil;
    lastVerificationCheck = Date.now();
    await client.authSDK.reload(target); await client.authSDK.getIdToken(target, true);
    assertAccount(target);
    changed(client.auth.currentUser);
    operation.adopt();
    if (!user.emailVerified && cooldown > Date.now()) verificationUntil = cooldown;
    queuedIdentity = false;
    status(user.emailVerified ? 'Email verified. Cloud controls are available.' : 'Email is not verified yet.');
    await checkProfile();
    operation.assert();
    if (store) await checkCloud();
  }
  $('#account-refresh').addEventListener('click', () => run(refreshVerification, 'Checking email verification…'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user && !user.emailVerified && !working && Date.now() - lastVerificationCheck > 30000) run(refreshVerification, 'Checking email verification…');
  });
  $('#account-edit-form').addEventListener('submit', event => {
    event.preventDefault();
    run(async operation => {
      if (!profileStore || !profile || profile.state === 'missing') throw new Error('Check shared profile setup first.');
      const target = user, targetStore = profileStore;
      const firstName = $('#edit-first').value, lastName = $('#edit-last').value;
      await targetStore.updateNames(firstName, lastName); operation.assert(); assertAccount(target);
      $('#account-edit-status').textContent = 'Shared names saved. Roles, email, jobs and listening history were not changed.';
      // Firestore is the shared profile source; an Auth display-name update is optional.
      try { await client.authSDK.updateProfile(target, { displayName: `${firstName.trim()} ${lastName.trim()}` }); operation.assert(); assertAccount(target); }
      catch { operation.assert(); assertAccount(target); $('#account-edit-status').textContent += ' The optional display name could not be refreshed.'; }
      await checkProfile(); operation.assert(); status('Profile names updated.');
    }, 'Saving profile names…');
  });
  $('#account-password-form').addEventListener('submit', event => {
    event.preventDefault();
    run(async operation => {
      const target = user, sdk = client.authSDK;
      const current = $('#security-current').value, next = $('#security-new').value;
      try {
        assertAccount(target); validateNewPassword(next, $('#security-confirm').value);
        if (!current) throw new Error('Enter your current password.');
        if (current === next) throw new Error('Choose a new password different from your current password.');
        await sdk.reauthenticateWithCredential(target, sdk.EmailAuthProvider.credential(target.email, current)); operation.assert(); assertAccount(target);
        await sdk.updatePassword(target, next); operation.assert(); assertAccount(target);
        await sdk.getIdToken(target, true); operation.assert(); assertAccount(target);
        $('#account-security-status').textContent = 'Password updated for Payola Reciept and Job Tracker. Other sessions may require sign-in again.';
        status('Shared password updated. Your history is unchanged.');
      } finally { if (operation.current()) clearSecrets(); }
    }, 'Updating shared password…');
  });
  $('#account-signout').addEventListener('click', () => run(async operation => {
    const clear = $('#account-clear-signout').checked;
    if (clear && localBusy()) throw new Error('Finish or cancel local work before clearing this device.');
    if (clear && !window.confirm('Sign out and clear the open listening view and remembered Last.fm username? Download a session first to keep it. Cloud history and jobs are not deleted.')) return;
    await client.authSDK.signOut(client.auth);
    if (client.auth.currentUser) throw new Error('Account changed during sign-out. Your local history was not cleared.');
    changed(null); operation.adopt();
    if (clear) clearLocal();
    $('#account-clear-signout').checked = false;
    status(clear ? 'Signed out and cleared local listening history and the saved username. Cloud history, downloaded files and Job Tracker are unchanged.' : 'Signed out on this website. The open local history remains in this tab; use Clear data or close it on a shared device. Job Tracker has its own sign-in session.');
  }));
  $('#cloud-check').addEventListener('click', () => run(async operation => { await checkCloud(); operation.assert(); status('Cloud status checked. Your local view is unchanged.'); }, 'Checking cloud status…'));
  $('#cloud-save').addEventListener('click', () => run(async operation => {
    if (!store || localBusy() || !canSave() || cloudVersion === null) throw new Error('Load history, finish pending work and check cloud status first.');
    const text = capture(), revision = localRevision, target = store, preservedRevision = preservation.revision;
    encodeCloud(text); // Validate before invalidating the known cloud version or prompting.
    if (!window.confirm('Upload this normalized listening history, dates, tracks and source declarations to Firebase? This replaces this account’s Payola snapshot, not its jobs. Original import files and credentials are not uploaded.')) return;
    const expectedVersion = cloudVersion;
    cloudVersion = null;
    try { const version = await target.save(text, expectedVersion); operation.assert(); cloudVersion = version; }
    catch (error) { if (operation.current()) cloudStatus('Save was not confirmed. Check cloud status before retrying; a pending write may still complete. Local history is unchanged.'); throw error; }
    savedRevision = revision;
    preservation.cloudSaved(preservedRevision);
    $('#cloud-conflict').hidden = true;
    cloudStatus(`Saved to your account · version ${cloudVersion}. Use Load saved history on another device.`);
    status('Cloud save succeeded. Local downloads still work.');
  }, 'Saving your history…'));
  $('#cloud-load').addEventListener('click', () => run(async operation => {
    if (!store || localBusy()) throw new Error('Finish pending work before loading.');
    const target = store, revision = localRevision;
    const loaded = await target.load();
    operation.assert();
    if (revision !== localRevision || localBusy()) throw new Error('Local view changed while loading. Retry; nothing was replaced.');
    if (!window.confirm('Replace the open view with your cloud snapshot? History remains user-editable, not verified. Last.fm dollar scenarios require a fresh opt-in.')) return;
    restore(loaded.text); cloudVersion = loaded.version; savedRevision = localRevision;
    preservation.cloudSaved();
    $('#cloud-conflict').hidden = true;
    cloudStatus(`Loaded cloud version ${loaded.version}.`); status('Saved history loaded. No histories were merged.');
  }, 'Loading saved history…'));
  $('#cloud-delete').addEventListener('click', () => run(async operation => {
    if (!store || (cloudVersion === null && !recovery)) throw new Error('Check cloud status first.');
    if (!window.confirm('Delete this account’s cloud Payola listening snapshot? This does not delete your local view, Job Tracker jobs, or the shared account.')) return;
    const target = store, expectedVersion = cloudVersion, repair = recovery;
    cloudVersion = null; recovery = null;
    try { const version = repair ? await target.recover(repair) : await target.remove(expectedVersion); operation.assert(); cloudVersion = version; }
    catch (error) { if (operation.current()) cloudStatus('Deletion was not confirmed. Check cloud status before retrying. Local history is unchanged.'); throw error; }
    savedRevision = -1;
    preservation.clearCloud();
    $('#cloud-conflict').hidden = true;
    cloudStatus('Cloud Payola history deleted. Local view and jobs are unchanged.');
    status('Cloud deletion succeeded. Your local view is unchanged.');
  }, 'Deleting cloud Payola history…'));
  const returnAction = new URL(location.href).searchParams.get('emailAction');
  if (returnAction === 'verify' || returnAction === 'reset') {
    const guidance = returnAction === 'verify' ? 'Back from your email? Connect your account, then check verification status. Returning here alone does not prove verification.' : 'Back from password recovery? Connect and sign in with your updated password. Returning here alone does not prove the reset completed.';
    $('#account-return-guidance').hidden = false;
    $('#account-return-guidance').textContent = guidance;
    status(guidance);
  }
  measureHistory(); render();
}