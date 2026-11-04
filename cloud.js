import { parseSession } from './session.js';

export const CLOUD_CHUNKS = 16;
export const CLOUD_CHUNK_BYTES = 256 * 1024;
export const MAX_CLOUD_BYTES = CLOUD_CHUNKS * CLOUD_CHUNK_BYTES;
export const conflict = () => new Error('Cloud history changed on another device. Check cloud status, then load it or explicitly replace it. Your local view is unchanged.');

export function encodeCloud(text) {
  parseSession(text);
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_CLOUD_BYTES) throw new Error('Cloud save exceeds 4 MiB. Download a local session instead (up to 25 MB). No cloud data was changed.');
  const chunks = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + CLOUD_CHUNK_BYTES, bytes.length);
    // Never split inside a UTF-8 code point.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end)));
    start = end;
  }
  if (chunks.length > CLOUD_CHUNKS) throw new Error('Cloud save requires too many chunks. Download a local session instead.');
  return { chunks, bytes: bytes.length };
}

export function validCloudMeta(value) {
  if (!value || value.schema !== 1 || !Number.isSafeInteger(value.version) || value.version < 1
    || typeof value.deleted !== 'boolean' || !Number.isSafeInteger(value.chunks) || value.chunks < 0 || value.chunks > CLOUD_CHUNKS
    || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_CLOUD_BYTES
    || (value.deleted ? value.chunks !== 0 || value.bytes !== 0 : value.chunks < 1 || value.bytes < 1)) throw new Error('Unsupported cloud history metadata. Local history is unchanged.');
  return value;
}

export function decodeCloud(meta, chunks) {
  validCloudMeta(meta);
  if (meta.deleted || chunks.length !== meta.chunks || chunks.some(c => !c || c.version !== meta.version || typeof c.data !== 'string' || new TextEncoder().encode(c.data).length > CLOUD_CHUNK_BYTES)) throw new Error('Cloud history is incomplete or changed. Retry loading. Local history is unchanged.');
  const text = chunks.map(c => c.data).join('');
  if (new TextEncoder().encode(text).length !== meta.bytes) throw new Error('Cloud history size could not be verified.');
  parseSession(text);
  return text;
}

// Dependency injection keeps transactions testable without production credentials.
export function createCloudStore(sdk, db, uid, stillCurrent = () => true) {
  const root = sdk.doc(db, 'payolaUsers', uid, 'state', 'current');
  const chunkRef = index => sdk.doc(db, 'payolaUsers', uid, 'chunks', String(index));
  const guard = () => { if (!stillCurrent()) throw new Error('Account changed. Retry using the current account.'); };
  async function status() {
    guard(); const snapshot = await sdk.getDocFromServer(root); guard();
    return snapshot.exists() ? validCloudMeta(snapshot.data()) : null;
  }
  async function write(text, expectedVersion, deleted = false) {
    const payload = deleted ? { chunks: [], bytes: 0 } : encodeCloud(text);
    guard();
    const version = await sdk.runTransaction(db, async tx => {
      guard(); const current = await tx.get(root); guard();
      const previous = current.exists() ? validCloudMeta(current.data()).version : 0;
      if (previous !== expectedVersion) throw conflict();
      const version = previous + 1;
      if (!Number.isSafeInteger(version)) throw new Error('Cloud version limit reached.');
      tx.set(root, { schema: 1, version, chunks: payload.chunks.length, bytes: payload.bytes, deleted, updatedAt: sdk.serverTimestamp() });
      // Fixed bounded slots: replacement clears all old content, including shorter saves.
      for (let i = 0; i < CLOUD_CHUNKS; i++) tx.set(chunkRef(i), { version, data: payload.chunks[i] || '' });
      return version;
    });
    guard(); return version;
  }
  async function load() {
    const meta = await status();
    if (!meta || meta.deleted) throw new Error('No saved Payola history on this account.');
    const chunks = [];
    for (let i = 0; i < meta.chunks; i++) {
      guard(); const snapshot = await sdk.getDocFromServer(chunkRef(i)); guard();
      chunks.push(snapshot.exists() ? snapshot.data() : null);
    }
    const latest = await status();
    if (!latest || latest.version !== meta.version) throw conflict();
    return { text: decodeCloud(meta, chunks), version: meta.version };
  }
  return { status, save: (text, expectedVersion) => write(text, expectedVersion), load, remove: expectedVersion => write('', expectedVersion, true) };
}