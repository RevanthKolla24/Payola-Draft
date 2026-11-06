import { readWithTimeout } from './account-utils.js';

export const RECEIPT_SLOTS = 20;
const limits = { title: 100, note: 500, source: 160, period: 200, amount: 80, label: 160, plays: 80, disclosure: 2000, highlights: 2000 };
export const EMPTY_RECEIPT = Object.fromEntries(Object.keys(limits).map(key => [key, '']));

export function validateReceipt(value) {
  if (!value || Object.keys(value).length !== Object.keys(limits).length + 1 || !['paper', 'midnight'].includes(value.theme)) throw new Error('Unsupported receipt summary.');
  for (const [key, max] of Object.entries(limits)) {
    if (typeof value[key] !== 'string' || value[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[key])) throw new Error(`Invalid receipt ${key} (maximum ${max} characters).`);
  }
  if (!value.title.trim() || !value.source.trim() || !value.disclosure.trim()) throw new Error('Receipt title, source and disclosures are required.');
  return Object.fromEntries([...Object.keys(limits), 'theme'].map(key => [key, value[key]]));
}

function validEntry(data) {
  if (!data || data.schema !== 1 || !Number.isSafeInteger(data.version) || data.version < 1 || typeof data.deleted !== 'boolean') throw new Error('Unsupported collection entry. Nothing was changed.');
  if (data.deleted) {
    if (Object.keys(data.receipt || {}).length) throw new Error('Invalid deleted receipt.');
  } else validateReceipt(data.receipt);
  return data;
}

export function createReceiptStore(sdk, db, uid, stillCurrent = () => true, timeout = 12000) {
  const guard = () => { if (!stillCurrent()) throw new Error('Account changed. Retry using the current account.'); };
  const ref = slot => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= RECEIPT_SLOTS) throw new Error('Invalid receipt slot.');
    return sdk.doc(db, 'payolaUsers', uid, 'receipts', String(slot));
  };
  async function list() {
    guard();
    const entries = await readWithTimeout(Promise.all(Array.from({ length: RECEIPT_SLOTS }, async (_, slot) => {
      const snapshot = await sdk.getDocFromServer(ref(slot));
      guard(); return { slot, ...(snapshot.exists() ? validEntry(snapshot.data()) : { version: 0, deleted: true }) };
    })), timeout);
    guard(); return entries;
  }
  async function write(slot, expectedVersion, receipt) {
    const reference = ref(slot), data = receipt === null ? {} : validateReceipt(receipt);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid receipt version.');
    guard();
    const version = await sdk.runTransaction(db, async tx => {
      guard(); const snapshot = await tx.get(reference); guard();
      const previous = snapshot.exists() ? validEntry(snapshot.data()).version : 0;
      if (previous !== expectedVersion) throw new Error('Your collection changed on another device. Refresh the collection before retrying.');
      tx.set(reference, { schema: 1, version: previous + 1, deleted: receipt === null, receipt: data, updatedAt: sdk.serverTimestamp() });
      return previous + 1;
    });
    guard(); return version;
  }
  return { list, save: write, remove: (slot, version) => write(slot, version, null) };
}

const xml = text => String(text).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
export function receiptSVG(value) {
  const receipt = validateReceipt(value);
  const lines = [receipt.title, receipt.source, receipt.period, `${receipt.label}: ${receipt.amount}`, `Included plays: ${receipt.plays}`, receipt.highlights, receipt.disclosure, receipt.note ? `Note: ${receipt.note}` : '', 'Saved summary · not a full-history backup.']
    .filter(Boolean).flatMap(line => {
      const words = line.split(/\s+/), wrapped = []; let current = '';
      for (const word of words) {
        if (current.length + word.length > 52) { wrapped.push(current); current = ''; }
        for (let i = 0; i < word.length; i += 52) {
          const part = word.slice(i, i + 52);
          if (i + 52 < word.length) wrapped.push(part); else current += `${current ? ' ' : ''}${part}`;
        }
      }
      if (current) wrapped.push(current);
      return [...wrapped, ''];
    });
  const dark = receipt.theme === 'midnight';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${120 + lines.length * 24}" viewBox="0 0 640 ${120 + lines.length * 24}"><rect width="100%" height="100%" fill="${dark ? '#18251f' : '#fffaf0'}"/><g fill="${dark ? '#fffaf0' : '#18251f'}" font-family="monospace" font-size="17"><text x="36" y="44">PAYOLA RECIEPT · PRIVATE COLLECTION</text>${lines.map((line, i) => `<text x="36" y="${88 + i * 24}">${xml(line)}</text>`).join('')}</g></svg>`;
}