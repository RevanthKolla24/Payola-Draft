import { escapeHTML as esc, number } from './lib.js';

const $ = selector => document.querySelector(selector);
const keys = ['date', 'artist', 'track', 'ms'];
export function createCSVGuide({ lock, start, notice, externalBusy = () => false }) {
  let worker, files = [], generation = 0, inspecting = false, ready = false;
  function cancel() {
    generation++; worker?.terminate(); worker = null; files = []; inspecting = false; ready = false;
    lock(false);
    if (externalBusy()) return;
    document.querySelectorAll('[data-csv-map], [data-guide-key], #history-files, #import-action, #csv-refresh-preview').forEach(control => { control.disabled = false; });
    if ($('#history-files')) $('#history-files').value = '';
    if ($('#csv-guide')) $('#csv-guide').hidden = true;
  }
  function mapping() { return Object.fromEntries(keys.map(key => [key, $(`#csv-${key}`).value.trim()])); }
  function inspect(selection, withMapping) {
    if (inspecting || externalBusy()) return;
    const token = ++generation; inspecting = true; ready = false; files = selection;
    lock(true); $('#csv-stage').disabled = true;
    const controls = () => document.querySelectorAll('[data-csv-map], [data-guide-key], #history-files, #import-action, #csv-refresh-preview');
    controls().forEach(control => { control.disabled = true; });
    $('#csv-guide').hidden = false; $('#csv-preview').textContent = 'Inspecting CSV locally in a background worker…';
    try {
      worker = new Worker(new URL('./import-worker.js', import.meta.url), { type: 'module' });
      const active = worker;
      active.onerror = event => { event.preventDefault(); finishError('CSV inspection failed. Choose smaller files or retry.'); };
      function finishError(message) {
        if (token !== generation) return;
        active.terminate(); worker = null; inspecting = false; lock(false); controls().forEach(control => { control.disabled = false; });
        $('#csv-preview').textContent = message;
      }
      active.onmessage = ({ data }) => {
        if (token !== generation) return;
        if (data.type === 'error') { finishError(data.message); return; }
        if (data.type !== 'csv-inspected') return;
        active.terminate(); worker = null; inspecting = false; lock(false); controls().forEach(control => { control.disabled = false; });
        $('#csv-headers').innerHTML = data.headers.map(header => `<option value="${esc(header)}"></option>`).join('');
        $('#csv-column-selects').innerHTML = keys.map(key => `<label>${{ date: 'Date column', artist: 'Artist column', track: 'Track column', ms: 'Duration column (optional)' }[key]}<select data-guide-key="${key}"><option value="">${key === 'ms' ? 'Unknown duration' : 'Choose a column'}</option>${data.headers.map(header => `<option value="${esc(header)}">${esc(header)}</option>`).join('')}</select></label>`).join('');
        const selected = mapping();
        document.querySelectorAll('[data-guide-key]').forEach(select => { select.value = data.headers.includes(selected[select.dataset.guideKey]) ? selected[select.dataset.guideKey] : ''; });
        ready = withMapping && !data.mappingError;
        $('#csv-stage').disabled = !ready;
        $('#csv-preview').innerHTML = `<p>${number(data.rows)} rows · ${number(selection.length)} file(s). ${withMapping ? `${number(data.audit.included)} included · ${number(data.audit.invalid)} invalid · ${number(data.audit.short)} short plays.` : 'Choose detected columns, then preview the normalized events.'}</p>${data.mappingError ? `<p>${esc(data.mappingError)}</p>` : ''}${data.preview.length ? `<div class="table-scroll"><table><caption>First five normalized rows · not yet imported</caption><thead><tr><th>Date</th><th>Artist</th><th>Track</th><th>Milliseconds played</th></tr></thead><tbody>${data.preview.map(row => row.invalid ? '<tr><td colspan="4">Invalid row — excluded from listening totals</td></tr>' : `<tr><td>${esc(row.date)}</td><td>${esc(row.artist)}</td><td>${esc(row.track)}</td><td>${row.ms === null ? 'Unknown' : number(row.ms)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
      };
      active.postMessage({ type: 'inspect-csv', files: selection, mapping: withMapping ? mapping() : undefined });
    } catch (error) { worker?.terminate(); worker = null; inspecting = false; lock(false); controls().forEach(control => { control.disabled = false; }); notice(error.message); }
  }
  function mount() {
    const mappingPanel = $('.csv-mapping');
    if (!mappingPanel) return;
    mappingPanel.insertAdjacentHTML('afterend', '<datalist id="csv-headers"></datalist><label class="remember-label"><input id="csv-guided" type="checkbox" checked> Guided mapping and preview before staging</label><section id="csv-guide" hidden><div class="csv-mapping" id="csv-column-selects"></div><div id="csv-preview" role="status"></div><button id="csv-refresh-preview" class="text-button" type="button">Preview mapped rows</button><button id="csv-stage" class="button" type="button" disabled>Stage selection for review</button><button id="csv-cancel-guide" class="text-button" type="button">Cancel selection</button><label class="remember-label"><input id="remember-csv-mapping" type="checkbox"> Remember only this column mapping on this device</label><button id="forget-csv-mapping" class="text-button" type="button">Forget saved mapping</button></section>');
    for (const key of keys) $(`#csv-${key}`).setAttribute('list', 'csv-headers');
    try {
      const saved = JSON.parse(localStorage.getItem('payola-csv-mapping') || 'null');
      if (saved && keys.every(key => typeof saved[key] === 'string' && saved[key].length <= 500)) {
        for (const key of keys) $(`#csv-${key}`).value = saved[key];
        $('#remember-csv-mapping').checked = true;
      }
    } catch { /* Optional preference storage. */ }
    const invalidate = () => { ready = false; $('#csv-stage').disabled = true; };
    mappingPanel.addEventListener('input', invalidate);
    $('#csv-column-selects').addEventListener('change', event => {
      const key = event.target.dataset.guideKey;
      if (keys.includes(key)) { $(`#csv-${key}`).value = event.target.value; invalidate(); }
    });
    $('#csv-guided').addEventListener('change', () => { if (externalBusy()) return; cancel(); notice('Choose the files again using the selected import workflow.'); });
    $('#csv-refresh-preview').addEventListener('click', () => { if (files.length) inspect(files, true); });
    $('#csv-cancel-guide').addEventListener('click', () => { if (externalBusy()) return; cancel(); notice('CSV selection cancelled. Existing history is unchanged.'); });
    $('#forget-csv-mapping').addEventListener('click', () => {
      try { localStorage.removeItem('payola-csv-mapping'); $('#remember-csv-mapping').checked = false; notice('Saved column mapping removed.'); }
      catch { notice('Browser storage could not be updated.'); }
    });
    $('#csv-stage').addEventListener('click', () => {
      if (!ready || inspecting || externalBusy()) return;
      if ($('#remember-csv-mapping').checked) {
        try { localStorage.setItem('payola-csv-mapping', JSON.stringify(mapping())); }
        catch { notice('Could not remember the mapping. Import remains available.'); }
      }
      const selection = files.slice(); cancel(); start(selection);
    });
  }
  return { mount, cancel, get pending() { return inspecting || files.length > 0; }, select(selection) { inspect(selection, false); } };
}