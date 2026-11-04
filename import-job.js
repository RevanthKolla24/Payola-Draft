import { normalizeRecords, mergeRecords } from './lib.js';
import { fileSources, MAX_BYTES } from './importer.js';
export const MAX_RECORDS = 200000;
export const MAX_SESSION_BYTES = 100 * 1024 * 1024;

// Run in a worker. The caller commits this entire selection only on completion.
export async function runImport(files, state, progress = () => {}) {
  const records = [...state.records], hashes = new Set(state.hashes), occurrences = new Map(state.occurrences);
  let bytes = state.bytes || 0, duplicates = state.duplicates || 0, expanded = 0, added = 0;
  const messages = [];
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) throw new Error('Select no more than 100 MB at once.');
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progress({ stage: `Opening ${file.name}`, value: i / files.length });
    try {
      const sources = await fileSources(file);
      for (let j = 0; j < sources.length; j++) {
        const source = sources[j]; expanded += source.size;
        if (expanded > MAX_BYTES) throw new Error('Expanded selection exceeds 100 MB. Use smaller batches.');
        try {
          progress({ stage: `Reading / decompressing ${source.name}`, value: (i + j / sources.length) / files.length });
          const text = await source.read();
          progress({ stage: `Checking duplicates: ${source.name}`, value: (i + j / sources.length) / files.length });
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
          if (hashes.has(hash)) { messages.push(`${source.name}: identical file contents already imported; skipped.`); continue; }
          if (bytes + source.size > MAX_SESSION_BYTES) throw new Error('Session limit: 100 MB of successfully imported JSON. Clear data to start a new session.');
          progress({ stage: `Parsing and validating ${source.name}`, value: (i + j / sources.length) / files.length });
          const data = JSON.parse(text);
          if (Array.isArray(data) && data.length > MAX_RECORDS) throw new Error('File exceeds the 200,000-record limit.');
          const normalized = normalizeRecords(data);
          // Merge into temporary containers so a rejected source cannot alter state.
          const candidate = [], candidateOccurrences = new Map(occurrences);
          const merged = mergeRecords(candidate, normalized, candidateOccurrences);
          if (records.length + candidate.length > MAX_RECORDS) throw new Error('Session limit: 200,000 retained records. Clear data to start again.');
          for (const r of candidate) records.push(r);
          occurrences.clear(); for (const [key, count] of candidateOccurrences) occurrences.set(key, count);
          hashes.add(hash); bytes += source.size; duplicates += merged.duplicates; added++;
          messages.push(`${source.name}: ${merged.added} records added, ${merged.duplicates} matching occurrences skipped.`);
        } catch (error) { messages.push(`${source.name}: ${error instanceof SyntaxError ? 'Invalid JSON. Choose an audio-history JSON file.' : error.message}`); }
      }
    } catch (error) { messages.push(`${file.name}: ${error.message}`); }
    progress({ stage: 'Finishing selection', value: (i + 1) / files.length });
  }
  return { records, hashes, occurrences, bytes, duplicates, messages, added };
}