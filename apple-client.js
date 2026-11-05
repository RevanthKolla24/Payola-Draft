import { APPLE_RECENT_PATH, recentItems, nextRecentPath } from './apple.js';
import { escapeHTML as esc } from './lib.js';
const $ = s => document.querySelector(s);
let kit, developerToken, userToken, next = null, count = 0, pages = 0, generation = 0, controller;
let sdkPromise;
function sdk() {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = () => { if (window.MusicKit) { cleanup(); resolve(window.MusicKit); } };
    const fail = () => { cleanup(); script.remove(); sdkPromise = null; reject(new Error('Apple MusicKit could not load. Check your network or browser privacy settings.')); };
    const timer = setTimeout(fail, 20000);
    function cleanup() { clearTimeout(timer); document.removeEventListener('musickitloaded', finish); }
    document.addEventListener('musickitloaded', finish);
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'; script.onload = finish; script.onerror = fail;
    document.head.append(script);
  });
  return sdkPromise;
}
function status(message) { $('#apple-status').textContent = message; }
function clear() {
  generation++; controller?.abort(); userToken = null; next = null; pages = 0; count = 0;
  $('#apple-items').replaceChildren(); $('#apple-summary').textContent = 'No content loaded. This preview is separate from Spotify and Last.fm data.';
  $('#apple-more').hidden = true; $('#apple-refresh').hidden = true;
}
$('#apple-prepare').addEventListener('click', async () => {
  $('#apple-prepare').disabled = true; status('Checking server configuration…');
  try {
    const response = await fetch('/api/apple/config', { cache: 'no-store' }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Apple configuration unavailable.');
    developerToken = data.developerToken;
    const MusicKit = await sdk();
    await MusicKit.configure({ developerToken, app: { name: 'Payola Reciept', build: '1.0.0' } });
    kit = MusicKit.getInstance(); $('#apple-authorize').hidden = false;
    status('Ready. Select Authorize with Apple to open Apple’s authorization flow. No history has been loaded.');
  } catch (error) { status(error.message); }
  finally { $('#apple-prepare').disabled = false; }
});
$('#apple-authorize').addEventListener('click', async () => {
  const token = ++generation; $('#apple-authorize').disabled = true; $('#apple-disconnect').hidden = false;
  try {
    // Directly invoked from the click to preserve browser popup permission.
    const authorized = await kit.authorize();
    if (token !== generation) return;
    if (typeof authorized !== 'string' || !authorized) throw new Error('Apple did not return an authorization token.');
    userToken = authorized; $('#apple-refresh').hidden = false;
    await loadPage(false);
  } catch { if (token === generation) status('Apple authorization or loading did not complete. Check subscription eligibility, token configuration, and popup permissions, then try again.'); }
  finally { $('#apple-authorize').disabled = false; }
});
async function loadPage(append) {
  if (!userToken) return;
  const token = ++generation; controller?.abort(); controller = new AbortController();
  const path = append ? next : APPLE_RECENT_PATH + '?limit=10'; if (!path) return;
  $('#apple-more').disabled = true; $('#apple-refresh').disabled = true; status('Loading recent content directly from Apple…');
  const requestController = controller;
  const timer = setTimeout(() => requestController.abort(), 15000);
  try {
    const response = await fetch('https://api.music.apple.com' + path, { headers: { Authorization: `Bearer ${developerToken}`, 'Music-User-Token': userToken }, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Apple rejected authorization. Disconnect and authorize again, or check the developer token and account eligibility.' : 'Apple recent content is unavailable. Try again later.');
    const data = await response.json(); if (token !== generation) return;
    const items = recentItems(data), following = nextRecentPath(data.next);
    if (!append) { $('#apple-items').replaceChildren(); count = 0; pages = 0; }
    $('#apple-items').insertAdjacentHTML('beforeend', items.map(a => `<tr><td>${esc(a.title)}</td><td>${esc(a.artist)}</td><td>${esc(a.album)}</td></tr>`).join(''));
    count += items.length; pages++; next = following;
    $('#apple-summary').textContent = `${count} recent resources displayed across ${pages} page(s). Not a play count or complete history. No royalty estimate. Refreshed ${new Date().toLocaleString()}.`;
    $('#apple-more').hidden = !next || pages >= 10;
    status(next && pages >= 10 ? 'Preview capped at 10 pages. More content exists; no complete-history claim is made.' : 'Recent content loaded. Returned resources are not verified individual playback events.');
  } catch (error) { if (token === generation) status(error.name === 'AbortError' ? 'Apple request timed out or was cancelled. Existing list is unchanged.' : error.message); }
  finally { clearTimeout(timer); if (token === generation) { $('#apple-more').disabled = false; $('#apple-refresh').disabled = false; } }
}
$('#apple-refresh').addEventListener('click', () => loadPage(false));
$('#apple-more').addEventListener('click', () => loadPage(true));
$('#apple-disconnect').addEventListener('click', async () => {
  clear(); $('#apple-disconnect').hidden = true; $('#apple-authorize').disabled = false;
  try { await kit?.unauthorize(); status('Disconnected. The recent-content list and in-memory user token were cleared.'); }
  catch { status('Local results cleared. Apple disconnect could not be confirmed; review access in your Apple account.'); }
});
window.addEventListener('pagehide', () => { generation++; controller?.abort(); userToken = null; });