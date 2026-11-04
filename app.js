import { RATE, money, number, escapeHTML as esc, normalizeRecords, summarize, manualSummary, sampleRecords, mergeRecords, listeningShares } from './lib.js';
import { fileSources, MAX_BYTES } from './importer.js';

const $ = selector => document.querySelector(selector);
let mode = 'sample';
let records = sampleRecords();
let result = summarize(records);
let manual = null;
let from = '', to = '';
let importedNames = new Set();
let occurrences = new Map();
let duplicateCount = 0;
let importController;
let selectedArtist = null;
let busy = false;
let generation = 0;
let toastTimer;

function notify(message) {
  $('#status').textContent = message; $('#status').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#status').hidden = true; }, 6500);
}
function coverage() {
  if (mode === 'manual') return 'Self-reported plays · No date range';
  let min = '', max = '';
  for (const r of records) if (r.date) { if (!min || r.date < min) min = r.date; if (!max || r.date > max) max = r.date; }
  if (!min) return 'No listening history loaded';
  const format = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${format(from || min)} – ${format(to || max)} · UTC`;
}
function render() {
  result = mode === 'manual' ? manual || { plays: 0, amount: 0, ms: null, artists: [], audit: null } : summarize(records, { from, to });
  $('#stat-plays').textContent = number(result.plays);
  $('#stat-hours').innerHTML = result.ms === null ? '—' : `${number(Math.round(result.ms / 3600000))} <em>hrs</em>`;
  $('#hours-note').textContent = result.ms === null ? 'Not available from manual counts' : 'With your favorite recordings';
  $('#stat-artists').textContent = number(result.artists.length);
  $('#receipt-total').textContent = money(result.amount);
  $('#receipt-plays').textContent = number(result.plays);
  $('#receipt-type').textContent = mode === 'sample' ? 'FICTIONAL SAMPLE' : mode === 'manual' ? 'SELF-REPORTED' : 'LOCAL IMPORT';
  $('#coverage').textContent = coverage();
  $('#date-toggle').hidden = mode === 'manual';
  if (mode === 'manual') $('#date-form').hidden = true;
  $('#source-label').textContent = mode === 'sample' ? 'FICTIONAL DATA · REAL MATH' : mode === 'manual' ? 'YOUR COUNTS · HISTORICAL BENCHMARK' : 'ON YOUR DEVICE · NEVER UPLOADED';
  $('#receipt-kicker').textContent = mode === 'sample' ? 'THE SAMPLE COLLECTION' : mode === 'manual' ? 'YOUR OWN ROTATION' : 'YOUR PRIVATE COLLECTION';
  $('#data-note').textContent = mode === 'sample' ? "You're exploring fictional listening data. Import your history to make it yours." : mode === 'manual' ? 'Self-reported counts are not verified streams. The estimate does not account for track eligibility.' : `History stays in this tab. ${number(duplicateCount)} matching playback occurrences skipped across files. Coverage reflects these files; completeness is not verified.`;
  $('#note-import').hidden = mode === 'import';
  $('#share-button').disabled = result.plays === 0;
  $('#audit').textContent = result.audit ? `Included: ${number(result.audit.included)} · Short plays: ${number(result.audit.short)} · Unsupported: ${number(result.audit.unsupported)} · Invalid: ${number(result.audit.invalid)} · Outside selected dates: ${number(result.audit.outside)}. Invalid records cannot be assigned to a date range.` : 'Manual mode: all entered plays are self-reported. No duration or eligibility checks are possible.';
  $('#calculation-formula').textContent = `${number(result.plays)} included plays × $0.003 = ${money(result.amount)} USD`;
  renderInsights();
  renderRows();
}
function renderInsights() {
  const months = result.months || [];
  const hours = $('#monthly-metric').value === 'hours';
  const value = m => hours ? m.ms / 3600000 : m.plays;
  const max = Math.max(1, ...months.map(value));
  $('#monthly-chart').innerHTML = months.length ? months.map(m => `<div class="month-column"><span class="month-value">${hours ? value(m).toFixed(1) : number(m.plays)}</span><div class="month-track"><div style="height:${Math.max(1, value(m) / max * 100)}%"></div></div><span>${esc(m.month)}</span></div>`).join('') : '<p class="chart-note">Monthly trends need dated listening history. Import files or try the sample.</p>';
  $('#monthly-data').innerHTML = months.length ? `<table><thead><tr><th>MONTH (UTC)</th><th>PLAYS</th><th>HOURS</th></tr></thead><tbody>${months.map(m => `<tr><td>${esc(m.month)}</td><td>${number(m.plays)}</td><td>${(m.ms / 3600000).toFixed(1)}</td></tr>`).join('')}</tbody></table><p class="chart-note">Only months with included plays are shown. Missing months do not prove zero listening.</p>` : '<p class="chart-note">No dated plays available.</p>';
  $('#share-chart').innerHTML = listeningShares(result.artists, result.plays).map((a, i) => `<div class="share-row"><span>${esc(a.name)}</span><div class="share-track"><span class="share-color-${i}" style="width:${a.percent}%"></span></div><strong>${a.percent.toFixed(1)}%</strong></div>`).join('') || '<p class="chart-note">Add plays to see your personal artist breakdown.</p>';
}
function renderRows() {
  const search = $('#artist-search').value.trim().toLocaleLowerCase();
  const artists = result.artists.map((artist, index) => ({ artist, index })).filter(({ artist }) => artist.name.toLocaleLowerCase().includes(search));
  const max = result.artists[0]?.plays || 1;
  $('#artist-rows').innerHTML = artists.slice(0, 100).map(({ artist: a, index }) => `<tr><td class="rank">${String(index + 1).padStart(2, '0')}</td><td><button class="artist-button" data-artist="${index}"><span class="artist-avatar avatar-${(index + 1) % 6}" aria-hidden="true">${esc(a.name[0])}</span><span><span class="artist-name">${esc(a.name)}</span><span class="artist-sub">${mode === 'sample' ? 'FICTIONAL ARTIST' : mode === 'manual' ? 'SELF-REPORTED' : `${a.tracks.size} TRACK${a.tracks.size === 1 ? '' : 'S'}`}</span></span></button></td><td>${number(a.plays)}<div class="play-bar"><span style="width:${Math.round(a.plays / max * 100)}%"></span></div></td><td>${money(a.plays * RATE)}</td></tr>`).join('') || `<tr><td colspan="4" class="empty-row">${search ? 'No artists match your search.' : mode === 'import' && !records.length ? 'Your next favorite perspective starts with an import.' : 'No included plays. Try a different date range or add your listening.'}</td></tr>`;
  $('#table-count').textContent = `${number(artists.length)} artist${artists.length === 1 ? '' : 's'}${search ? ' matching your search' : ' in your rotation'}${artists.length > 100 ? ' · First 100 shown; search to find more' : ''}`;
}
function setMode(next) {
  importController?.abort();
  selectedArtist = null;
  $('#artist-dialog').close();
  $('#artist-detail').replaceChildren();
  if (busy) generation++;
  busy = false;
  mode = next; from = ''; to = ''; $('#artist-search').value = '';
  $('#from-date').value = ''; $('#to-date').value = ''; $('#date-form').hidden = true; $('#date-toggle').setAttribute('aria-expanded', 'false');
  records = next === 'sample' ? sampleRecords() : []; manual = null; importedNames.clear(); occurrences.clear(); duplicateCount = 0;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === next));
  const panel = $('#input-panel'); panel.hidden = next === 'sample';
  if (next === 'manual') panel.innerHTML = `<section class="input-card"><h3>Put a number on your repeat button.</h3><p>No files needed. Enter an artist and your Spotify play count. We’ll use the same clearly labeled historical benchmark; plays are self-reported.</p><form id="manual-form"><label>Artist name<input name="artist" placeholder="Your favorite artist" required maxlength="100"></label><label>Spotify plays<input name="plays" type="number" min="1" max="10000000" step="1" placeholder="e.g. 500" required></label><button class="button" type="submit">Make my receipt ↗</button></form></section>`;
  else if (next === 'import') panel.innerHTML = `<section class="input-card"><h3>Bring your history. Keep it private.</h3><ol class="import-steps"><li><strong>Request your history</strong><p>In <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">Spotify privacy settings ↗</a>, request Extended Streaming History, not the standard account-history package.</p></li><li><strong>Download your export</strong><p>When it is ready, save the ZIP archive. Already unzipped? Choose audio-history JSON files instead.</p></li><li><strong>Open it here</strong><p>We read the files on your device. No account connection or upload required.</p></li></ol><label class="file-zone" id="drop-zone">↥ &nbsp; Drop a ZIP or JSON files here, or choose files<input id="history-files" type="file" accept=".zip,.json,application/json,application/zip" multiple><small>100 MB compressed / expanded JSON per selection. Unsupported ZIPs can be unzipped first.</small></label><progress id="import-progress" max="1" value="0" aria-label="Import progress" hidden></progress><div id="import-feedback" class="import-feedback" role="status" aria-live="polite"></div><section id="import-summary" hidden></section></section>`;
  else panel.innerHTML = '';
  render();
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
$('#note-import').addEventListener('click', () => setMode('import'));
$('#artist-search').addEventListener('input', renderRows);
$('#monthly-metric').addEventListener('change', renderInsights);
$('#clear-button').addEventListener('click', () => { generation++; setMode('import'); notify('Listening data cleared from this tab. No history was saved.'); });
$('#input-panel').addEventListener('submit', event => {
  if (event.target.id !== 'manual-form') return;
  event.preventDefault(); const data = new FormData(event.target);
  try { manual = manualSummary(String(data.get('artist')), Number(data.get('plays'))); render(); notify('Your Payola Draft is ready.'); } catch (error) { notify(error.message); }
});
$('#input-panel').addEventListener('change', event => {
  if (event.target.id !== 'history-files') return;
  importFiles([...event.target.files]);
});
for (const type of ['dragover', 'dragleave', 'drop']) $('#input-panel').addEventListener(type, event => {
  const zone = event.target.closest('#drop-zone'); if (!zone) return;
  event.preventDefault(); zone.classList.toggle('drag-active', type === 'dragover');
  if (type === 'drop' && !busy) importFiles([...event.dataTransfer.files]);
});
async function importFiles(files) {
  if (!files.length || busy) return;
  const feedback = $('#import-feedback');
  const input = $('#history-files');
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) { feedback.textContent = 'Please select less than 100 MB at once. You can add files in batches.'; input.value = ''; return; }
  const token = ++generation; busy = true; input.disabled = true;
  importController = new AbortController();
  const signal = importController.signal;
  const progress = $('#import-progress'); progress.hidden = false; progress.value = 0; progress.max = files.length;
  let added = 0, expanded = 0; const messages = [];
  for (const file of files) {
    if (token !== generation) return;
    feedback.textContent = `Reading ${file.name} locally…`;
    try {
      const sources = await fileSources(file);
      if (token !== generation) return;
      for (let index = 0; index < sources.length; index++) {
        if (token !== generation) return;
        const source = sources[index]; expanded += source.size;
        if (expanded > MAX_BYTES) throw new Error('Expanded JSON selection exceeds 100 MB. Import smaller batches.');
        feedback.textContent = `Reading ${source.name} locally… (${index + 1}/${sources.length})`;
        await new Promise(resolve => setTimeout(resolve, 0));
        try {
          const text = await source.read(signal);
          if (token !== generation) return;
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
          if (token !== generation) return;
          if (importedNames.has(digest)) { messages.push(`${source.name}: identical file contents already imported; skipped.`); continue; }
          const normalized = normalizeRecords(JSON.parse(text));
          const merged = mergeRecords(records, normalized, occurrences);
          importedNames.add(digest); duplicateCount += merged.duplicates; added++;
          messages.push(`${source.name}: ${number(merged.added)} records added, ${number(merged.duplicates)} matching occurrences skipped.`);
        } catch (error) { if (token !== generation) return; messages.push(`${source.name}: ${error instanceof SyntaxError ? 'Invalid JSON. Choose an audio-history JSON file.' : error.message}`); }
        progress.value = files.indexOf(file) + (index + 1) / sources.length;
      }
    } catch (error) { messages.push(`${file.name}: ${error.message}`); }
    progress.value = files.indexOf(file) + 1;
  }
  if (token !== generation) return;
  busy = false; input.disabled = false; input.value = '';
  feedback.textContent = messages.join('\n'); render();
  const full = summarize(records);
  $('#import-summary').hidden = false;
  $('#import-summary').innerHTML = `<h3>Import summary</h3><p>${number(records.length)} records retained · ${number(full.plays)} included plays · ${number(records.length - full.plays)} excluded · ${number(duplicateCount)} matching occurrences removed across files.</p><p>${esc(coverage())}<br>Coverage reflects these files; completeness is not verified. Duplicate detection uses timestamp, track identity, metadata, and duration. It cannot establish whether differing records represent the same listen.</p><a href="#dashboard">Explore your listening ↓</a>`;
  notify(added ? `${added} file${added === 1 ? '' : 's'} imported locally. Review exclusions under “What’s included”.` : 'No new files imported. See the message above.');
}
$('#date-toggle').addEventListener('click', () => { const form = $('#date-form'); form.hidden = !form.hidden; $('#date-toggle').setAttribute('aria-expanded', String(!form.hidden)); });
$('#date-form').addEventListener('submit', event => {
  event.preventDefault(); const a = $('#from-date').value, b = $('#to-date').value;
  if (a && b && a > b) { notify('The start date must be on or before the end date.'); return; }
  from = a; to = b; render();
});
$('#reset-dates').addEventListener('click', () => { from = ''; to = ''; $('#from-date').value = ''; $('#to-date').value = ''; render(); });
$('#artist-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-artist]'); if (!button) return;
  const a = result.artists[Number(button.dataset.artist)]; if (!a) return;
  selectedArtist = a;
  const tracks = [...a.tracks.entries()].sort((a, b) => b[1] - a[1]);
  $('#artist-detail').innerHTML = `<h2>${esc(a.name)}</h2><div class="detail-total">${money(a.plays * RATE)}</div><p class="detail-meta">Estimated recording royalties · ${number(a.plays)} plays${a.ms === null ? '' : ` · ${(a.ms / 3600000).toFixed(1)} hours`}<br>${esc(coverage())}${mode === 'sample' ? '<br>Fictional sample artist and listening data.' : ''}</p><p class="detail-meta">Historical benchmark, not confirmed earnings or artist take-home.</p>${tracks.length ? `<ul class="track-list">${tracks.slice(0, 50).map(([name, plays]) => `<li><span>${esc(name)}</span><span>${number(plays)} plays</span></li>`).join('')}</ul>${tracks.length > 50 ? '<p class="detail-meta">Top 50 tracks shown.</p>' : ''}` : '<p class="detail-meta">Track details are unavailable for manual counts.</p>'}`;
  const share = result.plays ? a.plays / result.plays * 100 : 0;
  $('#artist-detail').insertAdjacentHTML('beforeend', `<p class="detail-meta"><strong>${share.toFixed(1)}% of your included plays</strong> · Your listening share, not royalty-pool share.</p><div class="artist-share-controls"><label>Share card style<select id="artist-card-style"><option value="listening">Listening card · no dollar estimate</option><option value="value">Value card · includes estimate</option></select></label><button class="button" id="artist-download">Download artist card ↓</button></div><p class="chart-note">Shares this artist’s top tracks and selected dates. No account identifiers or raw history.</p>`);
  $('#artist-dialog').showModal();
});
$('#close-dialog').addEventListener('click', () => $('#artist-dialog').close());
$('#artist-dialog').addEventListener('click', event => { if (event.target === $('#artist-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
$('#share-button').addEventListener('click', () => downloadCard());
$('#artist-detail').addEventListener('click', event => {
  if (event.target.closest('#artist-download') && selectedArtist) downloadCard(selectedArtist, $('#artist-card-style').value);
});
function downloadCard(artist = null, style = 'value') {
  // Capture the selection before asynchronous image generation.
  const source = mode;
  const plays = artist ? artist.plays : result.plays;
  const valueCard = style === 'value';
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1420;
  const ctx = canvas.getContext('2d'); if (!ctx) { notify('Your browser could not create a receipt image.'); return; }
  ctx.fillStyle = '#f6f5f0'; ctx.fillRect(0, 0, 1000, 1420); ctx.fillStyle = '#eef0e6'; ctx.fillRect(75, 65, 850, 1280);
  const text = (value, x, y, font = '24px monospace', color = '#344a34') => { ctx.fillStyle = color; ctx.font = font; ctx.fillText(value, x, y, 730); };
  const line = y => { ctx.strokeStyle = '#bbc5ae'; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.moveTo(135, y); ctx.lineTo(865, y); ctx.stroke(); };
  text('YOUR PAYOLA DRAFT', 135, 135, '22px monospace');
  text(artist ? 'Your artist.' : 'Good music.', 135, 242, '72px Georgia'); text(artist ? artist.name : 'Real impact.', 135, 322, artist ? '54px Georgia' : '72px Georgia'); line(365);
  text(mode === 'sample' ? 'SPOTIFY · FICTIONAL SAMPLE' : mode === 'manual' ? 'SPOTIFY · SELF-REPORTED PLAYS' : 'SPOTIFY · IMPORTED HISTORY', 135, 415, '19px monospace');
  text(coverage(), 135, 453, '18px monospace');
  text(valueCard ? 'Estimated recording royalties' : 'Included plays on repeat', 135, 525, '24px Arial');
  text(valueCard ? money(plays * RATE) : number(plays), 135, 642, '108px Arial');
  text(valueCard ? `${number(plays)} PLAYS · USD · $3 / 1,000 PLAYS` : `${artist?.ms == null ? 'SELF-REPORTED' : `${(artist.ms / 3600000).toFixed(1)} HOURS`} · LISTENING CARD`, 135, 700, '21px monospace'); line(745);
  if (artist) {
    [...artist.tracks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([name, count], index) => { text(`${index + 1}. ${name.slice(0, 35)}`, 135, 800 + index * 58, '27px Arial'); text(`${number(count)} plays`, 700, 800 + index * 58, '21px monospace'); });
  } else result.artists.slice(0, 3).forEach((a, index) => { text(`${index + 1}. ${a.name.length > 32 ? `${a.name.slice(0, 31)}…` : a.name}`, 135, 800 + index * 58, '27px Arial'); text(money(a.plays * RATE), 725, 800 + index * 58, '24px monospace'); });
  line(980);
  if (artist) text(`${(artist.plays / result.plays * 100).toFixed(1)}% of your included plays · not royalty-pool share`, 135, 1020, '21px Arial');
  if (valueCard) {
    text('Historical benchmark: Duetti, 2024 Spotify sample.', 135, 1060, '20px Arial');
    text('Not a fixed rate or confirmed artist take-home.', 135, 1100, '23px Arial');
    text('Plan, country, contracts, eligibility not adjusted.', 135, 1140, '20px Arial');
  } else { text('Your listening, not a royalty or payout statement.', 135, 1070, '23px Arial'); text('Only included plays from the selected source.', 135, 1110, '21px Arial'); }
  text('THANK YOU FOR LISTENING', 135, 1240, '23px monospace'); text('Payola Draft', 135, 1285, '20px Arial');
  canvas.toBlob(blob => {
    if (!blob) { notify('Could not generate the image. Please try again.'); return; }
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = artist ? `payola-draft-artist-${style}-${source}.png` : `payola-draft-${source}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); notify('Payola Draft downloaded. It includes the visible highlights, not your raw history.');
  }, 'image/png');
}
render();