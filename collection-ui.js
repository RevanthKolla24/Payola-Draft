import { createReceiptStore, validateReceipt, receiptSVG, RECEIPT_SLOTS } from './collection.js';

const $ = selector => document.querySelector(selector);
export function initReceiptCollection({ captureReceipt, navigate, localBusy, run, accountBusy }) {
  let store = null, user = null, entries = null, pending = null, editing = null, generation = 0;
  const status = text => { $('#collection-status').textContent = text; };
  const message = error => error.code === 'permission-denied' ? 'Collection access denied. Verify your email; this feature also requires the new collection rules to be released by the owner.' : error.message;
  function render() {
    const locked = accountBusy();
    $('#keep-receipt').disabled = locked || localBusy();
    $('#keep-receipt').textContent = user ? 'Keep this receipt →' : 'Start your receipt collection →';
    $('#receipt-editor').hidden = !pending;
    $('#receipt-intent').hidden = !pending;
    $('#receipt-intent').textContent = pending ? user?.emailVerified ? 'Your receipt is ready to review. Nothing uploads until you confirm Save.' : 'Your receipt is kept only in this tab. Sign in and verify your email, then review and confirm Save. Reloading or closing this tab discards it.' : '';
    $('#collection-save').disabled = locked || !store || !entries;
    $('#collection-refresh').disabled = locked || !store;
    $('#collection-signup').hidden = Boolean(user);
    $('#collection-grid').replaceChildren();
    $('#collection-count').textContent = !user ? 'Sign in to open your private collection. Guests can still download receipts and full session files.' : !store ? 'Verify your email to use your collection.' : entries ? `${entries.filter(entry => !entry.deleted).length} / ${RECEIPT_SLOTS} receipts · summaries, not history backups` : 'Refresh to load your collection. No listening history is uploaded.';
    for (const entry of entries || []) {
      if (entry.deleted) continue;
      const card = document.createElement('article'); card.className = `collection-card collection-${entry.receipt.theme}`;
      const heading = document.createElement('h4'); heading.textContent = entry.receipt.title; card.append(heading);
      const savedAt = entry.updatedAt?.toDate?.();
      if (savedAt instanceof Date && !Number.isNaN(savedAt.getTime())) { const time = document.createElement('p'); time.className = 'chart-note'; time.textContent = `Saved ${savedAt.toLocaleString()}`; card.append(time); }
      for (const text of [entry.receipt.source, entry.receipt.period, `${entry.receipt.label}: ${entry.receipt.amount}`, `Included plays: ${entry.receipt.plays}`]) { const p = document.createElement('p'); p.textContent = text; card.append(p); }
      const preview = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Preview highlights & disclosures'; preview.append(summary);
      for (const text of [entry.receipt.highlights, entry.receipt.disclosure, entry.receipt.note]) { const p = document.createElement('p'); p.textContent = text; preview.append(p); }
      card.append(preview);
      const actions = document.createElement('div'); actions.className = 'collection-actions';
      for (const [label, action] of [
        ['Download SVG', () => download(entry.receipt)],
        ['Rename / edit note', () => openEditor(entry.receipt, entry)],
        ['Delete', () => execute(async operation => {
          if (!window.confirm(`Delete “${entry.receipt.title}” from your private collection? Your local view and full-history snapshot are unchanged.`)) return;
          const target = store; entries = null; render();
          await target.remove(entry.slot, entry.version); operation.assert();
          await refresh(operation); status('Receipt deleted. Your listening history is unchanged.');
        })]
      ]) { const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = label; button.disabled = locked; button.addEventListener('click', action); actions.append(button); }
      card.append(actions); $('#collection-grid').append(card);
    }
    $('#receipt-editor').querySelectorAll('input, textarea, select, button').forEach(control => { if (control.id !== 'collection-save') control.disabled = locked; });
  }
  function openEditor(receipt, entry = null) {
    pending = structuredClone(receipt); editing = entry ? { slot: entry.slot, version: entry.version } : null;
    $('#receipt-title').value = pending.title; $('#receipt-note').value = pending.note; $('#collection-theme').value = pending.theme;
    $('#receipt-editor-heading').textContent = editing ? 'Edit your saved receipt' : 'Keep this moment';
    $('#receipt-pending-preview').textContent = `${pending.source} · ${pending.period}\n${pending.label}: ${pending.amount} · Included plays: ${pending.plays}\n${pending.highlights}\n${pending.disclosure}`;
    render();
  }
  function download(receipt) {
    const url = URL.createObjectURL(new Blob([receiptSVG(receipt)], { type: 'image/svg+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = 'payola-saved-receipt.svg'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function refresh(operation) {
    const target = store; if (!target) throw new Error('Sign in and verify your email first.');
    entries = null; render(); const loaded = await target.list(); operation.assert(); entries = loaded; render();
  }
  function execute(action) {
    return run(async operation => {
      try { await action(operation); }
      catch (error) { if (operation.current()) status(`${message(error)} Nothing new was confirmed. Refresh before retrying; a pending write may still complete.`); throw error; }
    }, 'Working on your private receipt collection…');
  }
  $('#keep-receipt').addEventListener('click', () => {
    if (localBusy() || accountBusy()) return;
    try { openEditor(validateReceipt(captureReceipt())); navigate('/account'); status('Review your receipt below. Signing in never saves it automatically.'); }
    catch (error) { status(error.message); navigate('/account'); }
  });
  $('#collection-refresh').addEventListener('click', () => execute(refresh));
  $('#collection-signup').addEventListener('click', () => {
    $('#account-action').value = 'signup'; $('#account-action').dispatchEvent(new Event('change'));
    ($('#account-connect').hidden ? $('#account-email') : $('#account-connect')).focus();
  });
  $('#collection-cancel').addEventListener('click', () => { pending = null; editing = null; render(); status('Draft discarded. No cloud data changed.'); });
  $('#receipt-editor').addEventListener('submit', event => {
    event.preventDefault();
    execute(async operation => {
      if (!store || !entries || !pending) throw new Error('Refresh your collection before saving.');
      const receipt = validateReceipt({ ...pending, title: $('#receipt-title').value.trim(), note: $('#receipt-note').value, theme: $('#collection-theme').value });
      const slot = editing || entries.find(entry => entry.deleted);
      if (!slot) throw new Error('Your collection is full. Delete a receipt before adding another.');
      if (!window.confirm('Save this receipt summary, title, private note and theme to Firebase? The displayed source, period, totals, highlights and disclosures will be uploaded. Raw listening history is not included. This is not a full backup.')) return;
      const target = store; entries = null; render();
      await target.save(slot.slot, slot.version, receipt); operation.assert();
      pending = null; editing = null; await refresh(operation); status('Receipt saved to your private collection. Your full listening history was not backed up.');
    });
  });
  document.addEventListener('payola:busy', render);
  return {
    render,
    changed(next, client) {
      const oldUID = user?.uid; user = next; generation++; entries = null;
      if (oldUID && oldUID !== next?.uid) { pending = null; editing = null; $('#receipt-editor').reset(); $('#receipt-pending-preview').textContent = ''; }
      const current = generation;
      store = next?.emailVerified ? createReceiptStore(client.dbSDK, client.db, next.uid, () => generation === current) : null;
      status(''); render();
    }
  };
}