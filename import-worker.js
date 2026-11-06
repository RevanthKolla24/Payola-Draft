import { runImport } from './import-job.js';
import { csvRows, normalizeCSV } from './csv-history.js';
import { summarize } from './lib.js';
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'inspect-csv') {
      if (!data.files?.length || data.files.reduce((n, file) => n + file.size, 0) > 100 * 1024 * 1024) throw new Error('Choose up to 100 MB of CSV files.');
      const sources = [];
      let headers;
      for (const file of data.files) {
        const text = await file.text(), parsed = csvRows(text);
        if (headers && JSON.stringify(headers) !== JSON.stringify(parsed.headers)) throw new Error('Files in one CSV selection must have identical headers and column order.');
        headers = parsed.headers; sources.push({ text, rows: parsed.rows.length });
      }
      let preview = [], audit = { included: 0, short: 0, unsupported: 0, invalid: 0, outside: 0 }, mappingError = '';
      if (data.mapping) {
        try {
          for (const source of sources) {
            const records = normalizeCSV(source.text, data.mapping), summary = summarize(records);
            for (const key of Object.keys(audit)) audit[key] += summary.audit[key];
            if (preview.length < 5) preview.push(...records.slice(0, 5 - preview.length));
          }
        } catch (error) { mappingError = error.message; }
      }
      self.postMessage({ type: 'csv-inspected', headers, rows: sources.reduce((n, s) => n + s.rows, 0), preview, audit, mappingError });
      return;
    }
    const result = await runImport(data.files, data.state, progress => self.postMessage({ type: 'progress', ...progress }));
    self.postMessage({ type: 'done', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};