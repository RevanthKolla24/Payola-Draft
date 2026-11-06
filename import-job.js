import { normalizeRecords, mergeRecords, summarize } from './lib.js';
import { fileSources, MAX_BYTES } from './importer.js';
import { normalizeCSV } from './csv-history.js';
import { MAX_SESSION_FILE_BYTES } from './session.js';
export const MAX_RECORDS = 200000;
export const MAX_SESSION_BYTES = 100 * 1024 * 1024;
// Reserve room for the session envelope, filters and benchmark metadata.
export const MAX_IMPORT_RECORD_BYTES = MAX_SESSION_FILE_BYTES - 64 * 1024;

// Run in a worker. The caller commits this entire selection only on completion.
export async function runImport(files, state, progress = () => {}) {
  const records = [...state.records], hashes = new Set(state.hashes), occurrences = new Map(state.occurrences);
  let bytes = state.bytes || 0, duplicates = state.duplicates || 0, expanded = 0, added = 0;
  const messages = [], previews = [];
  const encoder = new TextEncoder();
  let recordBytes = encoder.encode(JSON.stringify(records)).byteLength;
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) throw new Error('Select no more than 100 MB at once.');
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progress({ stage: `Opening ${file.name}`, value: i / files.length });
    try {
      const sources = state.csv ? [{ name: file.name, size: file.size, read: () => file.text() }] : await fileSources(file);
      for (let j = 0; j < sources.length; j++) {
        const source = sources[j]; expanded += source.size;
        if (expanded > MAX_BYTES) throw new Error('Expanded selection exceeds 100 MB. Use smaller batches.');
        try {
          progress({ stage: `Reading / decompressing ${source.name}`, value: (i + j / sources.length) / files.length });
          const text = await source.read();
          progress({ stage: `Checking duplicates: ${source.name}`, value: (i + j / sources.length) / files.length });
          const mapping = state.mapping ?? { date: 'date', artist: 'artist', track: 'track', ms: 'ms_played' };
          const identity = state.csv ? JSON.stringify(['csv', ['date', 'artist', 'track', 'ms'].map(key => mapping[key] || ''), text]) : JSON.stringify(['spotify', text]);
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(identity)))].map(b => b.toString(16).padStart(2, '0')).join('');
          if (hashes.has(hash)) { previews.push({ name: source.name, status: 'duplicate file' }); messages.push(`${source.name}: identical file contents already imported; skipped.`); continue; }
          if (bytes + source.size > MAX_SESSION_BYTES) throw new Error('Session limit: 100 MB of successfully imported history. Clear data or choose Replace to start a new session.');
          progress({ stage: `Parsing and validating ${source.name}`, value: (i + j / sources.length) / files.length });
          const data = state.csv ? null : JSON.parse(text.replace(/^\uFEFF/, ''));
          if (Array.isArray(data) && data.length > MAX_RECORDS) throw new Error('File exceeds the 200,000-record limit.');
          const normalized = state.csv ? normalizeCSV(text, state.mapping) : normalizeRecords(data);
          if (!normalized.some(r => !r.invalid)) throw new Error('No valid listening events found. Existing history is unchanged.');
          // Merge into temporary containers so a rejected source cannot alter state.
          const candidate = [], candidateOccurrences = new Map(occurrences);
          const merged = mergeRecords(candidate, normalized, candidateOccurrences);
          if (records.length + candidate.length > MAX_RECORDS) throw new Error('Session limit: 200,000 retained records. Clear data to start again.');
          const candidateBytes = encoder.encode(JSON.stringify(candidate)).byteLength - 2 + (records.length && candidate.length ? 1 : 0);
          if (recordBytes + candidateBytes > MAX_IMPORT_RECORD_BYTES) throw new Error('Full-session backup limit: normalized history must fit within 25 MB, including session metadata. This file was not staged. Use smaller batches in separate sessions; download the current session before choosing Replace. A summary CSV is not a full backup.');
          for (const r of candidate) records.push(r);
          recordBytes += candidateBytes;
          occurrences.clear(); for (const [key, count] of candidateOccurrences) occurrences.set(key, count);
          hashes.add(hash); bytes += source.size; duplicates += merged.duplicates; added++;
          const dates = normalized.filter(r => !r.invalid).map(r => r.date).sort();
          previews.push({ name: source.name, status: 'accepted', source: state.csv ? 'User-provided CSV history (unverified)' : 'Spotify Extended Streaming History', records: normalized.length, added: merged.added, duplicates: merged.duplicates, ...summarize(normalized).audit, from: dates[0], to: dates.at(-1) });
          messages.push(`${source.name}: ${merged.added} records added, ${merged.duplicates} matching occurrences skipped.`);
        } catch (error) { previews.push({ name: source.name, status: 'rejected' }); messages.push(`${source.name}: ${error instanceof SyntaxError ? 'Invalid JSON. Choose an audio-history JSON file.' : error.message}`); }
      }
    } catch (error) { previews.push({ name: file.name, status: 'rejected' }); messages.push(`${file.name}: ${error.message}`); }
    progress({ stage: 'Finishing selection', value: (i + 1) / files.length });
  }
  return { records, hashes, occurrences, bytes, duplicates, messages, added, previews };
}