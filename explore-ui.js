import { escapeHTML as esc, number, summarize } from './lib.js';
import { qualityReport, recap, artistDetails, listeningPatterns, compareSessions, safeDiagnostics } from './explore.js';
import { parseSession, MAX_SESSION_FILE_BYTES } from './session.js';
import { comparePeriods } from './reports.js';
import { SERVICES } from './attribution.js';

const $ = selector => document.querySelector(selector);
export function downloadText(text, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function initExplore({ state, downloadCard }) {
  $('#dashboard').insertAdjacentHTML('beforeend', `<section class="insights explore-section" aria-labelledby="recap-heading"><h3 id="recap-heading">Your personal listening recap</h3><p>Uses the dashboard date filters. Monthly, yearly and custom periods stay tied to observed history.</p><div id="personal-recap"></div><button id="download-recap" class="text-button">Download unpriced recap card ↓</button></section><section class="insights explore-section" aria-labelledby="quality-heading"><h3 id="quality-heading">Understand your data</h3><div id="quality-report"></div><details><summary>Per-file import results · current tab only</summary><div id="quality-files"></div></details><button id="download-diagnostics" class="text-button">Download metadata-free diagnostics ↓</button><p class="chart-note">Diagnostics include counts and date coverage, not filenames, artists, tracks or raw records. Date coverage may still be personal.</p></section><section class="insights explore-section" aria-labelledby="patterns-heading"><h3 id="patterns-heading">Listening patterns · UTC</h3><div id="listening-patterns"></div></section>`);
  $('#share-button').insertAdjacentHTML('beforebegin', `<fieldset class="receipt-options"><legend>Customize your receipt</legend><label>Card style<select id="receipt-style"><option value="value">Source-appropriate receipt</option><option value="listening">Unpriced listening card</option></select></label><label>Highlights<select id="receipt-count"><option value="5">Top 5 artists</option><option value="10">Top 10 artists</option></select></label><label>Metric<select id="receipt-metric"><option value="plays">Plays / scrobbles</option><option value="hours">Hours, when available</option></select></label><label>Theme<select id="receipt-theme"><option value="cream">Cream & plum</option><option value="night">Night</option><option value="mint">Mint</option></select></label><button id="preview-receipt" class="text-button" type="button">Preview image</button><p class="chart-note">Source, coverage and estimate disclosures always remain on the image.</p></fieldset><dialog id="receipt-preview-dialog" aria-labelledby="receipt-preview-heading"><h2 id="receipt-preview-heading">Image preview</h2><button id="close-receipt-preview" class="text-button">Close preview</button><img id="receipt-preview-image" alt="Preview of the receipt image, with source and coverage disclosures"><p>Close this preview and choose Download to keep the image. It is not a full-session backup.</p></dialog>`);
  $('#history-workspace').insertAdjacentHTML('beforeend', `<section class="input-card" aria-labelledby="session-compare-heading"><h3 id="session-compare-heading">Compare two session files locally</h3><p>Neither file replaces or merges with your open history. Files stay in this tab; comparisons are unpriced and do not establish completeness.</p><label>Session A<input type="file" id="compare-file-a" accept=".json,application/json"></label><label>Session B<input type="file" id="compare-file-b" accept=".json,application/json"></label><button id="compare-sessions" class="text-button">Compare files</button><button id="clear-session-comparison" class="text-button">Clear comparison</button><div id="session-comparison" role="status"></div><button id="download-comparison" class="text-button" hidden>Download comparison summary ↓</button><p class="chart-note">The comparison download contains artist names and date coverage. Keep it private.</p></section>`);
  let comparison = null, comparing = false, comparisonGeneration = 0;
  function invalidateComparison() {
    comparisonGeneration++; comparison = null; comparing = false;
    $('#compare-sessions').disabled = false;
    $('#download-comparison').hidden = true;
  }
  function clearComparison() {
    invalidateComparison();
    $('#session-comparison').textContent = 'Comparison cleared.';
    $('#download-comparison').hidden = true;
    $('#compare-file-a').value = ''; $('#compare-file-b').value = '';
  }
  $('#clear-session-comparison').addEventListener('click', clearComparison);
  for (const id of ['compare-file-a', 'compare-file-b']) $(`#${id}`).addEventListener('change', () => {
    invalidateComparison();
    $('#session-comparison').textContent = 'Select both files, then compare.';
  });
  $('#compare-sessions').addEventListener('click', async () => {
    if (comparing) return;
    const token = ++comparisonGeneration;
    comparison = null; $('#download-comparison').hidden = true;
    comparing = true; $('#compare-sessions').disabled = true;
    try {
      const files = [$('#compare-file-a').files[0], $('#compare-file-b').files[0]];
      if (files.some(file => !file)) throw new Error('Choose two full-session JSON files.');
      if (files.some(file => file.size > MAX_SESSION_FILE_BYTES)) throw new Error('Each session must fit the 25 MB restore limit.');
      $('#session-comparison').textContent = 'Checking both local sessions…';
      const sessions = await Promise.all(files.map(async file => parseSession(await file.text())));
      if (token !== comparisonGeneration) return;
      comparison = compareSessions(...sessions);
      const describe = (s, label) => `<p><strong>${label}: ${esc(SERVICES[s.service])} · ${esc(s.mode)}</strong><br>${number(s.plays)} included · ${s.hours === null ? 'Duration unknown' : `${s.hours.toFixed(1)} hours`} · ${number(s.artists)} artists<br>Observed: ${esc(s.observed.from || 'unavailable')} – ${esc(s.observed.to || 'unavailable')}<br>Filters: ${esc(s.filters.from || 'open start')} – ${esc(s.filters.to || 'open end')}${s.declaration ? `<br>Last.fm declaration: ${esc(s.declaration.service)} · ${s.declaration.confirmed ? 'self-reported confirmed' : 'unconfirmed'} · ${esc(s.declaration.from)} – ${esc(s.declaration.to)}` : ''}</p>`;
      $('#session-comparison').innerHTML = `${describe(comparison.left, 'A')}${describe(comparison.right, 'B')}<p>${number(comparison.sharedArtists)} shared artists · ${number(comparison.sharedTracks)} exact artist/title pairs. Names are matched exactly, not resolved across services. Zero plays in a period do not prove no listening.</p><ul>${comparison.changes.slice(0, 20).map(a => `<li>${esc(a.name)}: ${number(a.before)} → ${number(a.after)} · ${a.delta.toFixed(1)} percentage-point share change</li>`).join('')}</ul>`;
      $('#download-comparison').hidden = false;
    } catch (error) { if (token === comparisonGeneration) $('#session-comparison').textContent = `${error.message} Open history is unchanged.`; }
    finally { if (token === comparisonGeneration) { comparing = false; $('#compare-sessions').disabled = false; } }
  });
  $('#download-comparison').addEventListener('click', () => {
    if (comparison && window.confirm('Download a local comparison containing artist names and date coverage? Keep it private.')) downloadText(JSON.stringify(comparison, null, 2), 'payola-session-comparison.json');
  });
  $('#download-diagnostics').addEventListener('click', () => {
    const s = state();
    if (window.confirm('Download counts and date coverage? No filenames, artist/track names or raw listening records are included.')) downloadText(JSON.stringify(safeDiagnostics(qualityReport(s.records, s.filters, s.duplicates), s.files), null, 2), 'payola-diagnostics.json');
  });
  $('#download-recap').addEventListener('click', () => downloadCard(null, 'listening'));
  $('#preview-receipt').addEventListener('click', () => downloadCard(null, $('#receipt-style').value, true));
  $('#close-receipt-preview').addEventListener('click', () => $('#receipt-preview-dialog').close());
  let previewURL, previewGeneration = 0;
  function invalidatePreview() {
    previewGeneration++;
    if ($('#receipt-preview-dialog').open) $('#receipt-preview-dialog').close();
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null; $('#receipt-preview-image').removeAttribute('src');
  }
  $('#receipt-preview-dialog').addEventListener('close', invalidatePreview);
  document.addEventListener('payola:page', invalidatePreview);
  document.addEventListener('payola:view', invalidatePreview);
  $('.receipt-options').addEventListener('change', invalidatePreview);
  return {
    clearComparison,
    beginPreview() {
      const token = ++previewGeneration;
      return () => token === previewGeneration;
    },
    preview(blob, isCurrent) {
      if (!isCurrent()) return;
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob); $('#receipt-preview-image').src = previewURL;
      if (!$('#receipt-preview-dialog').open) $('#receipt-preview-dialog').showModal();
    },
    artist(name) {
      const s = state();
      if (s.mode === 'manual') return '<p>Self-reported counts have no dated observations or track details.</p>';
      const detail = artistDetails(s.records, name, s.filters);
      const artist = s.result.artists.find(a => a.name === name);
      return `<section class="artist-deep-dive"><h3>Within the displayed history</h3><p>${s.result.plays && artist ? (artist.plays / s.result.plays * 100).toFixed(1) : '0.0'}% of included listening, not royalty-pool share.</p><p>First observed: ${esc(detail.first || 'unavailable')} · Last observed: ${esc(detail.last || 'unavailable')}. Not discovery dates.</p><p>${detail.change ? `${detail.change.previousPlays} → ${detail.change.plays} plays; ${detail.change.delta.toFixed(1)} percentage-point share change from the previous equal-length period.` : 'Previous-period comparison unavailable.'} ${detail.outsideCoverage ? 'Comparison extends beyond observed coverage.' : ''} Missing activity is not proof of zero listening.</p><ul>${detail.months.map(m => `<li>${esc(m.month)} · ${number(m.plays)} included</li>`).join('')}</ul></section>`;
    },
    render() {
      const s = state(), r = recap(s.result), q = qualityReport(s.records, s.filters, s.duplicates);
      const comparison = s.mode === 'manual' ? null : comparePeriods(s.records, s.filters);
      $('#personal-recap').innerHTML = `<p><strong>${number(r.plays)} ${s.mode === 'lastfm' ? 'scrobbles' : s.mode === 'manual' ? 'self-reported plays' : 'included events'}</strong> · ${r.hours === null ? 'Duration unknown' : `${r.hours.toFixed(1)} hours`} · ${number(r.artists)} artists</p><p>Top artist concentration: ${r.concentration === null ? 'unavailable' : `${r.concentration.toFixed(1)}% across the top ${Math.min(5, r.artists)} artists`}.</p><ol>${r.topArtists.map(a => `<li>${esc(a.name)} · ${number(a.plays)}</li>`).join('')}</ol><details><summary>Top tracks</summary><ol>${r.topTracks.map(t => `<li>${esc(t.artist)} — ${esc(t.title)} · ${number(t.plays)}</li>`).join('') || '<li>No track details available.</li>'}</ol></details><p>${comparison ? `Previous equal-length period: ${esc(comparison.previous.from)} – ${esc(comparison.previous.to)} · ${number(comparison.prior.plays)} included. ${comparison.outsideCoverage ? 'Period extends outside observed dates. ' : ''}` : 'No dated comparison available. '}Coverage is not guaranteed complete; missing dates do not establish zero listening. This recap is unpriced.${s.mode === 'sample' ? ' Fictional sample, not your listening.' : ''}${s.restored ? ' Restored user-editable history; provenance is not authenticated.' : ''}</p>`;
      $('#download-recap').disabled = !r.plays;
      $('#preview-receipt').disabled = !r.plays;
      $('#receipt-metric option[value="hours"]').disabled = s.result.ms === null;
      if (s.result.ms === null) $('#receipt-metric').value = 'plays';
      $('#quality-report').innerHTML = s.mode === 'manual' ? '<p>Manual counts cannot be audited for dates, duration or stream eligibility.</p>' : `<dl class="quality-grid">${[['Retained records', q.records], ['Included', q.included], ['Short plays (<30 seconds)', q.short], ['Unsupported', q.unsupported], ['Invalid / unassignable date', q.invalid], ['Outside selected dates', q.outside], ['Matching occurrences removed', q.duplicates], ['Included with known duration', q.knownDuration], ['Included with unknown duration', q.unknownDuration]].map(([label, value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join('')}</dl><p>Observed dates: ${esc(q.coverage.from || 'unavailable')} – ${esc(q.coverage.to || 'unavailable')}. Counts describe retained records; removed duplicates are reported separately. Short/unsupported classifications apply inside the selected period. Invalid records cannot be assigned to a date range.</p>`;
      $('#quality-files').innerHTML = s.files.length ? s.files.map(f => `<p><strong>${esc(f.name)}</strong> · ${esc(f.status)}<br>${number(f.records || 0)} parsed · ${number(f.added || 0)} retained · ${number(f.duplicates || 0)} duplicates · ${number(f.invalid || 0)} invalid · ${number(f.short || 0)} short · ${number(f.unsupported || 0)} unsupported</p>`).join('') : '<p>No per-file results available. File reports stay in this tab and are not restored from session files.</p>';
      const p = listeningPatterns(s.records, s.filters);
      const bars = (values, labels) => `<ol class="pattern-bars">${values.map((value, i) => `<li><span>${esc(labels[i])}</span><meter min="0" max="${Math.max(1, ...values)}" value="${value}">${value}</meter><span>${number(value)}</span></li>`).join('')}</ol>`;
      $('#listening-patterns').innerHTML = !p.timed ? '<p>Unavailable: this view has no validated precise timestamps. Date-only CSVs, old backups and manual counts never produce hourly patterns.</p>' : `<p>${number(p.timed)} of ${number(p.included)} included records have validated timestamps. UTC only; export timestamps may describe playback end, not start. Patterns describe this subset, not all listening.</p><details><summary>Hour of day</summary>${bars(p.hours, p.hours.map((_, i) => `${String(i).padStart(2, '0')}:00`))}</details><details><summary>Day of week</summary>${bars(p.weekdays, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])}</details><p>Longest observed consecutive-day run: ${p.longest} days. Gaps may mean missing data, not inactivity.</p><h4>Busiest observed days</h4><ul>${p.busiest.map(([date, count]) => `<li>${esc(date)} · ${number(count)} included</li>`).join('')}</ul>`;
    }
  };
}