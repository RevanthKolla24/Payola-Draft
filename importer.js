// Bounded, read-only ZIP support. Files are never written to disk or uploaded.
export const MAX_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipEntries(buffer) {
  if (buffer.byteLength > MAX_BYTES) throw new Error('ZIP exceeds the 100 MB compressed-size limit.');
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('Invalid or truncated ZIP. Unzip it and choose the audio JSON files instead.');
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || start === 0xffffffff || size === 0xffffffff) throw new Error('Multi-part and ZIP64 archives are not supported. Unzip first.');
  if (count > MAX_ENTRIES || start + size > end) throw new Error('ZIP directory is invalid or contains too many entries.');
  let cursor = start, expanded = 0;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > start + size || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    if (cursor + 46 + nameLength + extraLength + commentLength > start + size) throw new Error('Truncated ZIP entry.');
    const name = decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (/\.(json)$/i.test(name) && !name.startsWith('__MACOSX/') && !name.split('/').pop().startsWith('._')) {
      const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
      const compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true), offset = view.getUint32(cursor + 42, true);
      if (flags & 1) throw new Error('Encrypted ZIP files are not supported. Unzip first.');
      if (method !== 0 && method !== 8) throw new Error('Unsupported ZIP compression. Unzip first.');
      if (offset + 30 > start || view.getUint32(offset, true) !== 0x04034b50) throw new Error('Invalid ZIP file header.');
      const dataOffset = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      if (dataOffset + compressed > start) throw new Error('Truncated ZIP payload.');
      expanded += uncompressed;
      if (expanded > MAX_BYTES) throw new Error('Expanded JSON exceeds 100 MB. Unzip and import smaller batches.');
      entries.push({ name, method, size: uncompressed, crc: view.getUint32(cursor + 16, true), data: bytes.subarray(dataOffset, dataOffset + compressed) });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!entries.length) throw new Error('No JSON files found in this ZIP. Choose a Spotify Extended Streaming History export.');
  return entries;
}

export async function readEntry(entry, signal) {
  signal?.throwIfAborted();
  let bytes;
  if (entry.method === 0) bytes = entry.data;
  else {
    let stream;
    try { stream = new DecompressionStream('deflate-raw'); }
    catch { throw new Error('This browser cannot decompress this ZIP. Unzip it and select the JSON files.'); }
    const reader = new Blob([entry.data]).stream().pipeThrough(stream).getReader();
    const chunks = []; let length = 0;
    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > entry.size || length > MAX_BYTES) throw new Error('Expanded ZIP entry exceeds its declared size.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  }
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new Error('ZIP integrity check failed. Download or unzip the export again.');
  return decode(bytes);
}

export async function fileSources(file) {
  if (file.size > MAX_BYTES) throw new Error('File exceeds the 100 MB limit.');
  if (/\.zip$/i.test(file.name)) return zipEntries(await file.arrayBuffer()).map(entry => ({ name: `${file.name} / ${entry.name}`, size: entry.size, read: signal => readEntry(entry, signal) }));
  if (!/\.json$/i.test(file.name)) throw new Error('Choose a JSON file or ZIP archive.');
  return [{ name: file.name, size: file.size, read: async signal => { signal?.throwIfAborted(); return file.text(); } }];
}