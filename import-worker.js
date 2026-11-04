import { runImport } from './import-job.js';
self.onmessage = async ({ data }) => {
  try {
    const result = await runImport(data.files, data.state, progress => self.postMessage({ type: 'progress', ...progress }));
    self.postMessage({ type: 'done', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};