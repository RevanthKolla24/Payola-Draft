import { RATE, money, number, escapeHTML as esc, summarize, manualSummary, sampleRecords, listeningShares } from './lib.js';
import { bounds, presetRange, comparePeriods, summaryCSV } from './reports.js';
import { attribution, attributionText, SERVICES } from './attribution.js';
import { loadLastfm } from './lastfm-client.js';

const $ = selector => document.querySelector(selector);
let mode = 'sample';
let selectedService = 'spotify';
let manualService = 'spotify';
let records = sampleRecords();
let result = summarize(records);
let manual = null;
let from = '', to = '';
let importedNames = new Set();
let occurrences = new Map();
let duplicateCount = 0;
let importWorker;
let sessionBytes = 0;
let selectedArtist = null;
let busy = false;
let toastTimer;
let lastfmController;
let lastfmLoaded = null;
let lastfmAttribution = attribution();
const scenarioActive = () => mode === 'lastfm' && lastfmAttribution.scenario;
let rememberedUser = '';
try { rememberedUser = localStorage.getItem('payola-lastfm-user') || ''; } catch { /* Storage is optional. */ }

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
  if (mode === 'lastfm') { result.ms = null; result.amount = null; }
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
  $('#note-import').hidden = mode === 'import' || selectedService !== 'spotify' || mode === 'routes';
  $('#share-button').disabled = result.plays === 0;
  $('#audit').textContent = result.audit ? `Included: ${number(result.audit.included)} · Short plays: ${number(result.audit.short)} · Unsupported: ${number(result.audit.unsupported)} · Invalid: ${number(result.audit.invalid)} · Outside selected dates: ${number(result.audit.outside)}. Invalid records cannot be assigned to a date range.` : 'Manual mode: all entered plays are self-reported. No duration or eligibility checks are possible.';
  $('#calculation-formula').textContent = `${number(result.plays)} included plays × $0.003 = ${money(result.amount)} USD`;
  $('#export-csv').disabled = result.plays === 0;
  $('#period-controls').hidden = mode === 'manual';
  const years = [...new Set(records.filter(r => r.date).map(r => r.date.slice(0, 4)))].sort().reverse();
  const yearSelect = $('#year-preset'); const selectedYear = yearSelect.value;
  yearSelect.innerHTML = '<option value="">Choose a year</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
  yearSelect.value = years.includes(selectedYear) ? selectedYear : '';
  renderComparison();
  renderInsights();
  renderRows();
  renderSourceLabels();
  renderAttribution();
  renderHistoryInfo();
}
function renderHistoryInfo() {
  const last = mode === 'lastfm', counts = mode === 'manual', routes = mode === 'routes';
  const observed = bounds(records);
  const period = (start, end) => start && end ? `${start} – ${end} UTC` : 'No dated records loaded';
  const details = [
    ['Source', routes ? 'No route selected' : last ? 'Last.fm recorded scrobbles' : counts ? 'Manual, self-reported counts' : mode === 'sample' ? 'Fictional Spotify sample' : 'Local Spotify JSON/ZIP import'],
    ['Service attribution', routes ? 'Not declared' : last ? lastfmLoaded ? attributionText(lastfmAttribution) : 'Not declared; load history first' : counts ? `${SERVICES[manualService]} · self-reported, not verified` : 'Spotify export format; paid-stream eligibility not verified'],
    ['Original request / declaration period', last && lastfmLoaded ? period(lastfmAttribution.from, lastfmAttribution.to) : 'Not applicable'],
    ['Observed record dates', counts ? 'Unavailable from manual counts' : period(observed.from, observed.to)],
    ['Displayed period', counts ? 'No date range' : routes ? 'No history loaded' : coverage()],
    ['Duration', last || counts ? 'Unavailable; never inferred' : routes ? 'No history loaded' : 'Reported playback duration for included records'],
    ['Valuation', routes ? 'None' : scenarioActive() ? 'Optional hypothetical Spotify scenario · Duetti 2024 sample, $0.003/scrobble; not verified earnings' : last || (counts && manualService !== 'spotify') ? 'Unpriced · no royalty estimate' : 'Historical Spotify benchmark · Duetti 2024 sample, $0.003/play; not verified earnings'],
  ];
  $('#history-details').innerHTML = details.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('#history-audit').textContent = routes ? 'Choose a supported route above to begin. No history is loaded.' : $('#audit').textContent;
  $('#history-warning').textContent = routes ? 'Selecting a streaming service does not declare or verify the source of any listening history.' : counts ? 'Counts are self-reported. No duration, date coverage, or stream eligibility checks are possible.' : last ? 'Only previously scrobbled activity is available. Completeness and service attribution are not verified. Filters do not change the original declaration period; comparisons outside it have no service confirmation or established coverage.' : mode === 'sample' ? 'Fictional demonstration data, not your listening history.' : 'File coverage is not guaranteed complete. Missing dates do not prove zero listening; qualifying playback duration does not verify royalties.';
}
function renderAttribution() {
  if (mode === 'routes') {
    $('#source-label').textContent = 'CHOOSE A LISTENING SOURCE';
    $('#receipt .receipt-source > span:first-child').textContent = SERVICES[selectedService];
    $('#receipt-type').textContent = 'NO HISTORY LOADED';
    $('#receipt .receipt-amount-label').textContent = 'Choose a supported route to begin';
    $('#receipt-total').textContent = '—';
    $('#receipt .currency-label').textContent = 'NO ROYALTY ESTIMATE';
    $('#receipt .receipt-disclaimer').textContent = 'No history loaded. Service selection does not confirm the source of any listening.';
    $('#receipt').querySelectorAll('.receipt-line').forEach((line, index) => { if (index) line.hidden = true; });
    $('.assumptions-card').hidden = true;
    $('#data-note').textContent = 'Choose Last.fm, manual counts, or a supported file import above. Histories from different sources are never merged.';
    return;
  }
  if (mode === 'manual' && manualService !== 'spotify') {
    $('#receipt .receipt-source > span:first-child').textContent = SERVICES[manualService];
    $('#receipt .receipt-amount-label').textContent = 'Self-reported plays · no royalty estimate';
    $('#receipt-total').textContent = number(result.plays);
    $('#receipt .currency-label').textContent = 'SELF-REPORTED · UNPRICED';
    $('#source-label').textContent = `${SERVICES[manualService]} · SELF-REPORTED COUNTS`;
    $('#data-note').textContent = 'Self-reported counts are not verified streams. No validated benchmark for this service; no royalty estimate.';
    $('.amount-head').textContent = 'UNPRICED';
    $('#receipt .receipt-disclaimer').textContent = 'No validated benchmark for this service. Counts, duration and eligibility unverified.';
    $('#receipt').querySelectorAll('.receipt-line').forEach((line, index) => { if (index) line.hidden = true; });
    $('.assumptions-card').hidden = true;
    $('#calculation-formula').textContent = 'No royalty estimate for this service.';
    $('#artist-rows').querySelectorAll('tr').forEach(row => { if (row.cells.length === 4) row.cells[3].textContent = '—'; });
    $('.table-footer > span:last-child').textContent = 'Self-reported counts · no royalty estimate';
    return;
  }
  if (mode !== 'lastfm') return;
  const description = attributionText(lastfmAttribution);
  $('#receipt-type').textContent = lastfmAttribution.service === 'unknown' ? 'MIXED / UNKNOWN' : 'SELF-REPORTED SERVICE';
  $('#source-label').textContent = `LAST.FM · ${description}`;
  $('#data-note').textContent = `${description}. Attribution applies to the loaded request range, not proof of source. Scrobbles are not verified paid streams; duration and eligibility unknown. Reload to apply changed service selections.`;
  $('#receipt .currency-label').textContent = description;
  $('#receipt .receipt-disclaimer').textContent = `Data from Last.fm. ${description}. Actual duration and royalty eligibility unverified. Not confirmed earnings or artist take-home.`;
  $('#calculation-formula').textContent = scenarioActive() ? `${number(result.plays)} recorded scrobbles × $0.003 · hypothetical scenario, not verified royalties` : 'No royalty estimate for this history.';
  if (scenarioActive()) {
    $('#receipt .receipt-amount-label').textContent = 'Hypothetical Spotify benchmark scenario';
    $('#receipt-total').textContent = money(result.plays * RATE);
    $('#artist-rows').querySelectorAll('tr').forEach(row => {
      if (row.cells.length === 4) {
        const index = Number(row.querySelector('[data-artist]')?.dataset.artist);
        row.cells[3].textContent = money(result.artists[index].plays * RATE);
      }
    });
    $('.amount-head').textContent = 'SCENARIO USD';
    $('.table-footer > span:last-child').textContent = 'Hypothetical Spotify benchmark · self-reported service';
    $('#receipt .receipt-disclaimer').textContent += ` ${number(result.plays)} scrobbles × $0.003 (Duetti 2024 Spotify sample). Historical illustration, not verified royalties. Plan and country not adjusted.`;
  }
}
$('#input-panel').addEventListener('change', event => {
  if (event.target.matches('#lastfm-form [name=from], #lastfm-form [name=to]')) { $('#lastfm-confirm').checked = false; $('#lastfm-scenario').checked = false; $('#lastfm-scenario').disabled = true; }
  if (!['lastfm-service', 'lastfm-confirm'].includes(event.target.id)) return;
  if (event.target.id === 'lastfm-service') $('#lastfm-confirm').checked = false;
  const allowed = $('#lastfm-service').value === 'spotify' && $('#lastfm-confirm').checked;
  $('#lastfm-scenario').disabled = !allowed;
  if (!allowed) $('#lastfm-scenario').checked = false;
});
function renderSourceLabels() {
  const last = mode === 'lastfm';
  $('#stat-plays').previousElementSibling.innerHTML = last ? 'RECORDED SCROBBLES' : 'PLAYS INCLUDED <span aria-hidden="true">↗</span>';
  $('#stat-plays').nextElementSibling.textContent = last ? 'Dated Last.fm records; not verified streams' : mode === 'manual' ? 'Self-reported counts; duration and eligibility unknown' : 'Music plays of 30+ seconds';
  $('#receipt .receipt-source > span:first-child').textContent = last ? 'LAST.FM' : 'SPOTIFY';
  $('#receipt .receipt-amount-label').textContent = last ? 'Recorded scrobbles · no dollar estimate' : 'Estimated recording royalties';
  $('#receipt-total').textContent = last ? number(result.plays) : money(result.amount);
  $('#receipt-type').textContent = last ? 'SERVICE UNKNOWN' : $('#receipt-type').textContent;
  $('#receipt .currency-label').textContent = last ? 'DURATION AND ORIGINAL SERVICE UNKNOWN' : 'USD · HISTORICAL BENCHMARK';
  const lines = $('#receipt').querySelectorAll('.receipt-line');
  lines[0].firstElementChild.textContent = last ? 'Recorded scrobbles' : 'Included plays';
  lines[1].hidden = last; lines[2].hidden = last;
  $('#receipt .receipt-disclaimer').innerHTML = last ? 'Listening recorded by Last.fm. Original service and actual duration are unknown. No paid-stream verification or royalty estimate. Data from Last.fm.' : 'A little perspective, not a payout statement. This is an estimate for recordings, <strong>not the artist’s take-home.</strong>';
  $('.assumptions-card').hidden = last;
  $('#source-label').textContent = last ? 'LAST.FM · RECORDED LISTENING' : $('#source-label').textContent;
  $('#receipt-kicker').textContent = last ? 'YOUR LAST.FM COLLECTION' : $('#receipt-kicker').textContent;
  $('#hours-note').textContent = last ? 'Unavailable from scrobbles' : $('#hours-note').textContent;
  $('#monthly-metric option[value="hours"]').disabled = last;
  $('#monthly-metric option[value="plays"]').textContent = last ? 'Recorded scrobbles' : 'Included plays';
  $('#data-note').textContent = last ? 'Last.fm scrobbles are not verified paid streams. Service and duration unknown. No royalty estimate. Histories are never combined with Spotify imports.' : $('#data-note').textContent;
  $('#audit').textContent = last ? `Dated scrobbles included: ${number(result.plays)}. ${lastfmLoaded?.skipped || 0} now-playing or unusable entries skipped; ${lastfmLoaded?.duplicates || 0} identical timestamp/artist/track entries collapsed. Coverage is not guaranteed complete.` : $('#audit').textContent;
  $('.amount-head').textContent = last ? 'ROYALTIES' : 'EST. ROYALTIES ↘';
  $('.table-footer > span:last-child').textContent = last ? 'Last.fm · No royalty estimate' : 'USD · Recording royalties only';
  $('.privacy-card p').innerHTML = last ? 'Username and dates pass through our server to Last.fm.<br>No history is saved by this app. Optional username storage only.' : 'Files are processed on your device.<br>No uploads. No account. No tracking.';
  if (last) {
    $('#artist-rows').querySelectorAll('tr').forEach(row => { if (row.cells.length === 4) row.cells[3].textContent = '—'; });
    $('#monthly-data').querySelectorAll('tbody tr').forEach(row => { row.cells[2].textContent = 'Unavailable'; });
  }
}
function renderInsights() {
  const months = result.months || [];
  const hours = mode !== 'lastfm' && $('#monthly-metric').value === 'hours';
  const value = m => hours ? m.ms / 3600000 : m.plays;
  const max = Math.max(1, ...months.map(value));
  $('#monthly-chart').innerHTML = months.length ? months.map(m => `<div class="month-column"><span class="month-value">${hours ? value(m).toFixed(1) : number(m.plays)}</span><div class="month-track"><div style="height:${Math.max(1, value(m) / max * 100)}%"></div></div><span>${esc(m.month)}</span></div>`).join('') : '<p class="chart-note">Monthly trends need dated listening history. Import files or try the sample.</p>';
  $('#monthly-data').innerHTML = months.length ? `<table><thead><tr><th>MONTH (UTC)</th><th>PLAYS</th><th>HOURS</th></tr></thead><tbody>${months.map(m => `<tr><td>${esc(m.month)}</td><td>${number(m.plays)}</td><td>${m.ms === null ? 'Unavailable' : (m.ms / 3600000).toFixed(1)}</td></tr>`).join('')}</tbody></table><p class="chart-note">Only months with included plays are shown. Missing months do not prove zero listening.</p>` : '<p class="chart-note">No dated plays available.</p>';
  $('#share-chart').innerHTML = listeningShares(result.artists, result.plays).map((a, i) => `<div class="share-row"><span>${esc(a.name)}</span><div class="share-track"><span class="share-color-${i}" style="width:${a.percent}%"></span></div><strong>${a.percent.toFixed(1)}%</strong></div>`).join('') || '<p class="chart-note">Add plays to see your personal artist breakdown.</p>';
}
function renderRows() {
  const search = $('#artist-search').value.trim().toLocaleLowerCase();
  const artists = result.artists.map((artist, index) => ({ artist, index })).filter(({ artist }) => artist.name.toLocaleLowerCase().includes(search));
  const max = result.artists[0]?.plays || 1;
  $('#artist-rows').innerHTML = artists.slice(0, 100).map(({ artist: a, index }) => `<tr><td class="rank">${String(index + 1).padStart(2, '0')}</td><td><button class="artist-button" data-artist="${index}"><span class="artist-avatar avatar-${(index + 1) % 6}" aria-hidden="true">${esc(a.name[0])}</span><span><span class="artist-name">${esc(a.name)}</span><span class="artist-sub">${mode === 'sample' ? 'FICTIONAL ARTIST' : mode === 'manual' ? 'SELF-REPORTED' : `${a.tracks.size} TRACK${a.tracks.size === 1 ? '' : 'S'}`}</span></span></button></td><td>${number(a.plays)}<div class="play-bar"><span style="width:${Math.round(a.plays / max * 100)}%"></span></div></td><td>${money(a.plays * RATE)}</td></tr>`).join('') || `<tr><td colspan="4" class="empty-row">${search ? 'No artists match your search.' : mode === 'import' && !records.length ? 'Your next favorite perspective starts with an import.' : 'No included plays. Try a different date range or add your listening.'}</td></tr>`;
  $('#table-count').textContent = `${number(artists.length)} artist${artists.length === 1 ? '' : 's'}${search ? ' matching your search' : ' in your rotation'}${artists.length > 100 ? ' · First 100 shown; search to find more' : ''}`;
  if (mode === 'manual' && manualService !== 'spotify') renderAttribution();
  if (mode === 'lastfm') {
    $('#artist-rows').querySelectorAll('tr').forEach(row => { if (row.cells.length === 4) row.cells[3].textContent = '—'; });
    renderAttribution();
  }
}
function setMode(next) {
  if (next === 'import' && selectedService !== 'spotify') return;
  lastfmController?.abort(); lastfmController = null; lastfmLoaded = null; lastfmAttribution = attribution();
  stopImport();
  manualService = selectedService;
  selectedArtist = null;
  $('#artist-dialog').close();
  $('#artist-detail').replaceChildren();
  busy = false;
  mode = next; from = ''; to = ''; $('#artist-search').value = '';
  $('#from-date').value = ''; $('#to-date').value = ''; $('#date-form').hidden = true; $('#date-toggle').setAttribute('aria-expanded', 'false');
  records = next === 'sample' ? sampleRecords() : []; manual = null; importedNames.clear(); occurrences.clear(); duplicateCount = 0; sessionBytes = 0;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === next));
  const panel = $('#input-panel'); panel.hidden = next === 'sample';
  if (next === 'routes') panel.innerHTML = `<section class="input-card"><h3>Choose how to add your ${SERVICES[selectedService]} listening.</h3><p>Use the routes above. Last.fm is recommended only if you already scrobble; it is not required. Manual counts are always available.${selectedService === 'spotify' ? ' Spotify JSON/ZIP imports are also supported.' : ' No file-history importer or validated royalty benchmark is available for this service.'}${selectedService === 'apple' ? ' The optional Apple Music preview shows recent resources, not play counts.' : ''}</p></section>`;
  else if (next === 'manual') panel.innerHTML = `<section class="input-card"><h3>Put a number on your repeat button.</h3><p>No files needed. Enter an artist and your ${SERVICES[selectedService]} play count. Counts are self-reported; non-Spotify counts are unpriced.</p><form id="manual-form"><label>Artist name<input name="artist" placeholder="Your favorite artist" required maxlength="100"></label><label>${SERVICES[selectedService]} plays<input name="plays" type="number" min="1" max="10000000" step="1" placeholder="e.g. 500" required></label><button class="button" type="submit">Make my receipt ↗</button></form></section>`;
  else if (next === 'import') panel.innerHTML = `<section class="input-card"><h3>Bring your history. Keep it private.</h3><ol class="import-steps"><li><strong>Request your history</strong><p>In <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">Spotify privacy settings ↗</a>, request Extended Streaming History, not the standard account-history package.</p></li><li><strong>Download your export</strong><p>When it is ready, save the ZIP archive. Already unzipped? Choose audio-history JSON files instead.</p></li><li><strong>Open it here</strong><p>We read the files on your device. No account connection or upload required.</p></li></ol><label class="file-zone" id="drop-zone">↥ &nbsp; Drop a ZIP or JSON files here, or choose files<input id="history-files" type="file" accept=".zip,.json,application/json,application/zip" multiple><small>100 MB input / expanded JSON per selection. Session cap: 100 MB imported JSON and 200,000 retained records. Cancel discards the entire pending selection. Unsupported ZIPs can be unzipped first.</small></label><progress id="import-progress" max="1" value="0" aria-label="Import progress" hidden></progress><div id="import-feedback" class="import-feedback" role="status" aria-live="polite"></div><section id="import-summary" hidden></section></section>`;
  else if (next === 'lastfm') {
    $('#monthly-metric').value = 'plays';
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7) + '-01';
    panel.innerHTML = `<section class="input-card"><h3>Your scrobbles. No downloads.</h3><p>Load public recorded listening from Last.fm. No password or account authorization. Only previously scrobbled activity is available—not your entire streaming history. Actual duration is unknown. Declare a service below; only explicitly confirmed Spotify histories may opt into a hypothetical historical benchmark scenario.</p><p>Your username and dates go through this server to Last.fm. History stays in this tab, without server persistence. Hosting infrastructure may log requests. Loading or refreshing replaces the current Last.fm view only after success.</p><form id="lastfm-form"><label>Last.fm username<input name="user" id="lastfm-user" maxlength="50" required pattern="[a-zA-Z0-9_-]+" value="${esc(rememberedUser)}" autocomplete="off"></label><label>From (UTC)<input name="from" type="date" min="1970-01-01" value="${month}" required></label><label>To (UTC)<input name="to" type="date" min="1970-01-01" value="${today}" required></label><label>Streaming service<select name="service" id="lastfm-service">${Object.entries(SERVICES).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label class="remember-label"><input id="lastfm-confirm" type="checkbox"> All scrobbles in the requested period came from this service (self-reported)</label><label class="remember-label"><input id="lastfm-scenario" type="checkbox" disabled> Optional Spotify historical benchmark scenario—not verified earnings</label><label class="remember-label"><input id="remember-lastfm" type="checkbox" ${rememberedUser ? 'checked' : ''}> Remember username on this device</label><button class="button" type="submit">Load / refresh listening ↻</button><button class="text-button" type="button" id="forget-lastfm">Forget saved username</button><button class="text-button" type="button" id="cancel-lastfm" hidden>Cancel loading</button></form><progress id="lastfm-progress" max="1" value="0" aria-label="Last.fm loading progress" hidden></progress><p id="lastfm-status" role="status" aria-live="polite">Select a range of up to 100 pages (about 20,000 scrobbles). Refresh is manual, not continuous syncing.</p><a id="lastfm-credit" href="https://www.last.fm/" target="_blank" rel="noreferrer">Listening data from Last.fm ↗</a></section>`;
  } else panel.innerHTML = '';
  render();
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
$('#note-import').addEventListener('click', () => setMode('import'));
$('#artist-search').addEventListener('input', renderRows);
$('#monthly-metric').addEventListener('change', renderInsights);
$('#clear-button').addEventListener('click', () => { setMode(mode === 'lastfm' ? 'lastfm' : selectedService === 'spotify' ? 'import' : 'routes'); notify('Listening data cleared from this tab. Saved usernames can be removed with “Forget saved username”.'); });
$('#input-panel').addEventListener('submit', event => {
  if (event.target.id === 'lastfm-form') { event.preventDefault(); fetchScrobbles(event.target); return; }
  if (event.target.id !== 'manual-form') return;
  event.preventDefault(); const data = new FormData(event.target);
  try { manual = manualSummary(String(data.get('artist')), Number(data.get('plays'))); manualService = selectedService; if (manualService !== 'spotify') manual.amount = null; render(); notify('Your Payola Draft is ready.'); } catch (error) { notify(error.message); }
});
$('#input-panel').addEventListener('click', event => {
  if (event.target.id === 'cancel-lastfm') { lastfmController?.abort(); }
  if (event.target.id === 'forget-lastfm') { rememberedUser = ''; try { localStorage.removeItem('payola-lastfm-user'); } catch {} $('#lastfm-user').value = ''; $('#remember-lastfm').checked = false; notify('Saved username removed.'); }
});
async function fetchScrobbles(form) {
  if (lastfmController) return;
  const data = new FormData(form), user = String(data.get('user')).trim();
  let selectedAttribution;
  try { selectedAttribution = attribution(String(data.get('service')), $('#lastfm-confirm').checked, $('#lastfm-scenario').checked); } catch (error) { notify(error.message); return; }
  const start = String(data.get('from')), end = String(data.get('to'));
  if (start > end) { notify('The start date must be on or before the end date.'); return; }
  const controller = new AbortController(); lastfmController = controller;
  const status = $('#lastfm-status'), progress = $('#lastfm-progress'), button = form.querySelector('[type="submit"]');
  button.disabled = true; $('#cancel-lastfm').hidden = false; progress.hidden = false;
  try {
    const loaded = await loadLastfm({ user, from: start, to: end, signal: controller.signal, progress: (message, value) => { status.textContent = message; progress.value = value; } });
    if (lastfmController !== controller) return;
    records = loaded.records; from = start; to = end; lastfmLoaded = loaded; lastfmAttribution = { ...selectedAttribution, from: start, to: end };
    $('#from-date').value = start; $('#to-date').value = end;
    if ($('#remember-lastfm').checked) { rememberedUser = user; try { localStorage.setItem('payola-lastfm-user', user); } catch { notify('Could not save the username on this device.'); } }
    else { rememberedUser = ''; try { localStorage.removeItem('payola-lastfm-user'); } catch {} }
    $('#lastfm-credit').href = `https://www.last.fm/user/${encodeURIComponent(user)}`;
    status.textContent = `Loaded ${number(records.length)} scrobbles across ${loaded.pages} page(s). Requested ${start} – ${end} UTC. Refreshed ${new Date().toLocaleString()}. Not guaranteed complete; ${loaded.skipped} now-playing/unusable entries skipped and ${loaded.duplicates} identical entries collapsed.`;
    render();
  } catch (error) {
    if (lastfmController !== controller) return;
    status.textContent = error.name === 'AbortError' ? 'Loading cancelled. Previous results are unchanged. No partial history was saved.' : `${error.message} Previous results are unchanged; no partial history was saved.`;
  } finally {
    if (lastfmController === controller) { lastfmController = null; button.disabled = false; $('#cancel-lastfm').hidden = true; progress.hidden = true; }
  }
}
$('#input-panel').addEventListener('change', event => {
  if (event.target.id !== 'history-files') return;
  importFiles([...event.target.files]);
});
for (const type of ['dragover', 'dragleave', 'drop']) $('#input-panel').addEventListener(type, event => {
  const zone = event.target.closest('#drop-zone'); if (!zone) return;
  event.preventDefault(); zone.classList.toggle('drag-active', type === 'dragover');
  if (type === 'drop' && !busy) importFiles([...event.dataTransfer.files]);
});
function stopImport() {
  importWorker?.terminate(); importWorker = null; busy = false;
  if ($('#history-files')) { $('#history-files').disabled = false; $('#history-files').value = ''; }
  if ($('#cancel-import')) $('#cancel-import').hidden = true;
  if ($('#import-progress')) $('#import-progress').hidden = true;
}
function importFiles(files) {
  if (!files.length || busy) return;
  if (!window.Worker) { notify('This browser does not support background imports. Try a modern browser.'); return; }
  const feedback = $('#import-feedback'), input = $('#history-files');
  const cancel = document.createElement('button'); cancel.id = 'cancel-import'; cancel.className = 'text-button'; cancel.textContent = 'Cancel import';
  $('#cancel-import')?.remove(); feedback.before(cancel);
  cancel.addEventListener('click', () => { stopImport(); feedback.textContent = 'Import cancelled. The whole current selection was discarded; previously imported history is unchanged.'; });
  busy = true; input.disabled = true;
  const progress = $('#import-progress'); progress.hidden = false; progress.max = 1; progress.value = 0;
  feedback.textContent = 'Starting private background import… Previously imported history remains unchanged until this selection finishes.';
  try {
    const worker = new Worker(new URL('./import-worker.js', import.meta.url), { type: 'module' }); importWorker = worker;
    worker.onerror = event => { event.preventDefault(); stopImport(); feedback.textContent = 'Background import failed. Previous history is unchanged. Try a smaller file or another browser.'; };
    worker.onmessage = ({ data }) => {
      if (worker !== importWorker) return;
      if (data.type === 'progress') { feedback.textContent = data.stage; progress.value = data.value; return; }
      if (data.type === 'error') { stopImport(); feedback.textContent = data.message; return; }
      const imported = data.result;
      records = imported.records; importedNames = imported.hashes; occurrences = imported.occurrences;
      sessionBytes = imported.bytes; duplicateCount = imported.duplicates;
      stopImport(); feedback.textContent = imported.messages.join('\n'); render();
      const full = summarize(records), available = bounds(records);
      $('#import-summary').hidden = false;
      $('#import-summary').innerHTML = `<h3>Import summary</h3><p>${number(records.length)} records retained · ${number(full.plays)} included plays · ${number(records.length - full.plays)} excluded · ${number(duplicateCount)} matching occurrences removed across files.</p><p>${esc(available.from || 'No dates')} – ${esc(available.to || 'No dates')} (UTC)<br>${(sessionBytes / 1048576).toFixed(1)} / 100 MB imported JSON · ${number(records.length)} / 200,000 records.<br>Coverage reflects these files; completeness is not verified. Matching uses timestamp, track identity, metadata, and duration.</p>`;
      notify(imported.added ? 'Background import complete. Review the summary and exclusions.' : 'No new files imported. Review the feedback.');
    };
    worker.postMessage({ files, state: { records, hashes: importedNames, occurrences, bytes: sessionBytes, duplicates: duplicateCount } });
  } catch (error) { stopImport(); feedback.textContent = `Could not start background import: ${error.message}`; }
}
function applyRange(range) {
  from = range.from; to = range.to;
  $('#from-date').value = from; $('#to-date').value = to; render();
}
$('#period-controls').addEventListener('click', event => {
  const button = event.target.closest('[data-preset]'); if (button) { $('#year-preset').value = ''; applyRange(presetRange(records, button.dataset.preset)); }
});
$('#year-preset').addEventListener('change', event => { if (event.target.value) applyRange(presetRange(records, event.target.value)); });
$('#compare-toggle').addEventListener('change', renderComparison);
function renderComparison() {
  const panel = $('#comparison'); panel.hidden = mode === 'manual' || !$('#compare-toggle').checked;
  if (panel.hidden) return;
  const c = comparePeriods(records, { from, to });
  if (!c) { panel.textContent = 'Import dated history to compare periods.'; return; }
  const signed = n => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  panel.innerHTML = `<h3>Your rotation, compared.</h3><p class="chart-note">Selected: ${c.from} – ${c.to}<br>Previous: ${c.previous.from} – ${c.previous.to}<br>Equal-length windows: ${number(c.days)} days each (UTC). ${c.outsideCoverage ? '<strong>One or both periods extend outside the observed file dates.</strong> ' : ''}Coverage completeness is not verified; gaps are not proof of zero listening.</p><div class="comparison-stats"><p><strong>${number(c.current.plays - c.prior.plays)}</strong> play change${c.playChange === null ? ' · No percentage: previous period has no included plays.' : ` · ${signed(c.playChange)}%`}</p><p><strong>${mode === 'lastfm' ? 'Unavailable' : signed((c.current.ms - c.prior.ms) / 3600000)}</strong> hours change</p></div><ul class="comparison-artists">${c.artists.slice(0, 8).map(a => `<li><span>${esc(a.name)}${a.newInPeriod ? '<small>New in this period—not necessarily newly discovered</small>' : ''}</span><span>${signed(a.delta)} pp listening share<br><small>${number(a.previousPlays)} → ${number(a.plays)} plays</small></span></li>`).join('') || '<li>No included plays in either period.</li>'}</ul>`;
  if (mode === 'lastfm') panel.insertAdjacentHTML('beforeend', `<p class="chart-note">Data from Last.fm · ${esc(attributionText(lastfmAttribution))}. Comparison counts recorded scrobbles, not verified streams. Duration unknown.</p>`);
}
$('#export-csv').addEventListener('click', () => {
  const range = bounds(records);
  const csv = summaryCSV(result, { source: mode === 'lastfm' ? 'Last.fm recorded scrobbles' : mode === 'sample' ? 'Fictional sample' : mode === 'manual' ? `Self-reported ${SERVICES[manualService]}` : 'Local Spotify import', from: mode === 'manual' ? '' : from || range.from, to: mode === 'manual' ? '' : to || range.to, duplicates: duplicateCount, attribution: mode === 'lastfm' ? lastfmAttribution : null });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `payola-draft-summary-${mode}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000); notify('CSV downloaded with artist totals, source, dates, exclusions, and benchmark assumptions.');
});
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
  if (mode === 'lastfm') {
    $('#artist-detail .detail-total').textContent = `${number(a.plays)} scrobbles`;
    $('#artist-detail .detail-meta').textContent = `Recorded Last.fm scrobbles · ${coverage()} · ${attributionText(lastfmAttribution)}`;
    $('#artist-detail').querySelectorAll('.detail-meta')[1].textContent = `Data from Last.fm. ${attributionText(lastfmAttribution)}. Duration and eligibility unknown. ${scenarioActive() ? `${money(a.plays * RATE)} hypothetical Spotify benchmark scenario; not confirmed earnings.` : 'No royalty estimate.'}`;
    if (!scenarioActive()) $('#artist-card-style option[value=value]').remove();
    else $('#artist-card-style option[value=value]').textContent = 'Hypothetical Spotify scenario · self-reported service';
    $('#artist-detail').querySelectorAll('.track-list li span:last-child').forEach(el => { el.textContent = el.textContent.replace('plays', 'scrobbles'); });
  }
  if (mode === 'manual' && manualService !== 'spotify') {
    $('#artist-detail .detail-total').textContent = `${number(a.plays)} self-reported plays`;
    $('#artist-detail .detail-meta').textContent = `${SERVICES[manualService]} · unpriced · duration and eligibility unknown`;
    $('#artist-detail').querySelectorAll('.detail-meta')[1].textContent = 'No validated benchmark for this service; no royalty estimate.';
    $('#artist-card-style option[value=value]').remove();
  }
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
  const valueCard = (mode !== 'manual' || manualService === 'spotify') && (mode !== 'lastfm' || scenarioActive()) && style === 'value';
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1420;
  const ctx = canvas.getContext('2d'); if (!ctx) { notify('Your browser could not create a receipt image.'); return; }
  ctx.fillStyle = '#f6f5f0'; ctx.fillRect(0, 0, 1000, 1420); ctx.fillStyle = '#eef0e6'; ctx.fillRect(75, 65, 850, 1280);
  const text = (value, x, y, font = '24px monospace', color = '#344a34') => { ctx.fillStyle = color; ctx.font = font; ctx.fillText(value, x, y, 730); };
  const line = y => { ctx.strokeStyle = '#bbc5ae'; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.moveTo(135, y); ctx.lineTo(865, y); ctx.stroke(); };
  text('YOUR PAYOLA DRAFT', 135, 135, '22px monospace');
  text(artist ? 'Your artist.' : 'Good music.', 135, 242, '72px Georgia'); text(artist ? artist.name : 'Real impact.', 135, 322, artist ? '54px Georgia' : '72px Georgia'); line(365);
  text(mode === 'lastfm' ? 'LAST.FM · RECORDED SCROBBLES' : mode === 'sample' ? 'SPOTIFY · FICTIONAL SAMPLE' : mode === 'manual' ? `${SERVICES[manualService]} · SELF-REPORTED PLAYS` : 'SPOTIFY · IMPORTED HISTORY', 135, 415, '19px monospace');
  text(coverage(), 135, 453, '18px monospace');
  if (mode === 'lastfm') {
    text(lastfmAttribution.confirmed ? `${lastfmAttribution.label} · self-reported${scenarioActive() ? ' · hypothetical scenario' : ' · unpriced'}` : 'Mixed / unknown services · unpriced', 135, 482, '16px Arial');
    if (lastfmLoaded) text(`Original request / declaration: ${lastfmAttribution.from} – ${lastfmAttribution.to} UTC`, 135, 505, '15px Arial');
  }
  text(valueCard ? (mode === 'lastfm' ? 'Hypothetical benchmark scenario' : 'Estimated recording royalties') : mode === 'lastfm' ? 'Recorded scrobbles' : 'Included plays on repeat', 135, 525, '24px Arial');
  text(valueCard ? money(plays * RATE) : number(plays), 135, 642, '108px Arial');
  text(valueCard ? `${number(plays)} ${mode === 'lastfm' ? 'SCROBBLES' : 'PLAYS'} · USD · $3 / 1,000` : `${artist?.ms == null ? (mode === 'lastfm' ? 'DURATION UNKNOWN' : 'SELF-REPORTED') : `${(artist.ms / 3600000).toFixed(1)} HOURS`} · LISTENING CARD`, 135, 700, '21px monospace'); line(745);
  if (artist) {
    [...artist.tracks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([name, count], index) => { text(`${index + 1}. ${name.slice(0, 35)}`, 135, 800 + index * 58, '27px Arial'); text(`${number(count)} ${mode === 'lastfm' ? 'scrobbles' : 'plays'}`, 700, 800 + index * 58, '21px monospace'); });
  } else result.artists.slice(0, 3).forEach((a, index) => { text(`${index + 1}. ${a.name.length > 32 ? `${a.name.slice(0, 31)}…` : a.name}`, 135, 800 + index * 58, '27px Arial'); text(valueCard ? money(a.plays * RATE) : `${number(a.plays)} scrobbles`, 700, 800 + index * 58, '24px monospace'); });
  line(980);
  if (artist) text(`${(artist.plays / result.plays * 100).toFixed(1)}% of your included ${mode === 'lastfm' ? 'scrobbles' : 'plays'} · not royalty-pool share`, 135, 1020, '21px Arial');
  if (valueCard) {
    text('Historical benchmark: Duetti, 2024 Spotify sample.', 135, 1060, '20px Arial');
    text('Not a fixed rate or confirmed artist take-home.', 135, 1100, '23px Arial');
    text('Plan, country, contracts, eligibility not adjusted.', 135, 1140, '20px Arial');
  } else { text('Your listening, not a royalty or payout statement.', 135, 1070, '23px Arial'); text(mode === 'lastfm' ? 'Data from Last.fm. Duration and eligibility unknown.' : 'Only included plays from the selected source.', 135, 1110, '21px Arial'); }
  text('THANK YOU FOR LISTENING', 135, 1240, '23px monospace'); text('Payola Draft', 135, 1285, '20px Arial');
  canvas.toBlob(blob => {
    if (!blob) { notify('Could not generate the image. Please try again.'); return; }
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = artist ? `payola-draft-artist-${style}-${source}.png` : `payola-draft-${source}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); notify('Payola Draft downloaded. It includes the visible highlights, not your raw history.');
  }, 'image/png');
}
render();
$('#service-picker').addEventListener('change', () => {
  const nextService = $('#service-picker').value;
  if ((mode !== 'sample' && (records.length || manual || lastfmLoaded || importedNames.size)) || busy || lastfmController) {
    if (!window.confirm('Switch streaming service? This clears the loaded history and cancels any pending request or import. Download a CSV first if you want to keep the current summary.')) {
      $('#service-picker').value = selectedService;
      return;
    }
  }
  selectedService = nextService;
  document.querySelector('[data-mode="import"]').hidden = selectedService !== 'spotify';
  $('#apple-preview-link').hidden = selectedService !== 'apple';
  $('#service-help').textContent = 'Last.fm recommended if you already scrobble—not required. Manual counts are also available. ' + (selectedService === 'spotify' ? 'Spotify JSON/ZIP imports are supported.' : 'No history importer or validated royalty benchmark for this service.');
  setMode('routes');
});
