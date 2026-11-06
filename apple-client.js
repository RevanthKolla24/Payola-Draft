import { APPLE_RECENT_PATH, recentItems, nextRecentPath } from './apple.js';
import { escapeHTML as esc } from './lib.js';
const $ = s => document.querySelector(s);
let kit, developerToken, userToken, next = null, count = 0, pages = 0, generation = 0, controller;
let sdkPromise;
let preparing = false, authorizing = false, disconnecting = false, preparation = 0, prepareController;
let sdkPending = false, recoveryRequired = false;
function sdkOperation(task) {
  sdkPending = true;
  let timer;
  return Promise.race([
    Promise.resolve().then(task).finally(() => { sdkPending = false; }),
    new Promise((_, reject) => { timer = setTimeout(() => {
      recoveryRequired = true;
      reject(new Error('Apple did not finish this operation. Local results can be cleared, but Apple access was not confirmed disconnected. Reload this preview before connecting again.'));
    }, 20000); })
  ]).finally(() => { clearTimeout(timer); connectionControls(); });
}
function connectionControls() {
  $('#apple-prepare').disabled = recoveryRequired || preparing || authorizing || disconnecting || Boolean(userToken);
  $('#apple-authorize').disabled = recoveryRequired || preparing || authorizing || disconnecting;
  $('#apple-disconnect').disabled = recoveryRequired || preparing || authorizing || disconnecting;
  $('#apple-recover').hidden = !recoveryRequired;
}
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
  if (recoveryRequired || preparing || authorizing || disconnecting || userToken) return;
  const token = ++preparation;
  preparing = true; connectionControls(); status('Checking server configuration…');
  const requestController = new AbortController(); prepareController = requestController;
  const timer = setTimeout(() => requestController.abort(), 8000);
  try {
    const response = await fetch('/api/apple/config', { cache: 'no-store', signal: requestController.signal });
    requestController.signal.throwIfAborted();
    const data = await response.json();
    requestController.signal.throwIfAborted();
    clearTimeout(timer);
    if (token !== preparation) return;
    if (!response.ok) throw new Error(data.error || 'Apple configuration unavailable.');
    if (typeof data.developerToken !== 'string' || !data.developerToken.trim()) throw new Error('Apple configuration did not include a developer token.');
    const configuredToken = data.developerToken;
    const MusicKit = await sdk();
    if (token !== preparation) return;
    await sdkOperation(() => MusicKit.configure({ developerToken: configuredToken, app: { name: 'Payola Reciept', build: '1.0.0' } }));
    if (token !== preparation) return;
    developerToken = configuredToken; kit = MusicKit.getInstance(); $('#apple-authorize').hidden = false;
    status('Ready. Select Authorize with Apple to open Apple’s authorization flow. No history has been loaded.');
  } catch (error) { if (token === preparation) status(error.name === 'AbortError' ? 'Apple configuration timed out or was cancelled. Try preparing again.' : error.message); }
  finally { clearTimeout(timer); if (token === preparation) { preparing = false; prepareController = null; connectionControls(); } }
});
$('#apple-authorize').addEventListener('click', async () => {
  if (recoveryRequired || !kit || preparing || authorizing || disconnecting) return;
  const token = ++generation; authorizing = true; connectionControls(); $('#apple-disconnect').hidden = false;
  try {
    // Directly invoked from the click to preserve browser popup permission.
    // Start synchronously inside the click handler to preserve popup permission.
    const authorization = kit.authorize();
    const authorized = await sdkOperation(() => authorization);
    if (token !== generation) return;
    if (typeof authorized !== 'string' || !authorized) throw new Error('Apple did not return an authorization token.');
    userToken = authorized; $('#apple-refresh').hidden = false;
    await loadPage(false);
  } catch (error) { if (token === generation) status(recoveryRequired ? error.message : 'Apple authorization or loading did not complete. Check subscription eligibility, token configuration, and popup permissions, then try again.'); }
  finally { authorizing = false; connectionControls(); }
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
    requestController.signal.throwIfAborted();
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Apple rejected authorization. Disconnect and authorize again, or check the developer token and account eligibility.' : 'Apple recent content is unavailable. Try again later.');
    const data = await response.json();
    requestController.signal.throwIfAborted();
    if (token !== generation) return;
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
  if (recoveryRequired || preparing || authorizing || disconnecting) return;
  disconnecting = true;
  clear(); const token = generation; connectionControls();
  status('Disconnecting from Apple… Local results and the in-memory token were cleared.');
  try { await sdkOperation(() => kit?.unauthorize()); if (token === generation) status('Disconnected. The recent-content list and in-memory user token were cleared.'); }
  catch (error) { if (token === generation) status(recoveryRequired ? error.message : 'Local results cleared. Apple disconnect could not be confirmed; review access in your Apple account.'); }
  finally { disconnecting = false; $('#apple-disconnect').hidden = true; connectionControls(); }
});
$('#apple-recover').addEventListener('click', () => { clear(); window.location.reload(); });
window.addEventListener('pagehide', () => {
  if (sdkPending) recoveryRequired = true;
  generation++; preparation++; prepareController?.abort(); controller?.abort(); userToken = null;
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  clear(); preparing = false; authorizing = false; disconnecting = false;
  $('#apple-disconnect').hidden = true;
  connectionControls();
  status(recoveryRequired ? 'An Apple operation was interrupted. Local results were cleared; Apple disconnect is not confirmed. Reload this preview before connecting again.' : 'Preview restored. Local results and token were cleared. Choose Prepare or Authorize to reconnect explicitly.');
});