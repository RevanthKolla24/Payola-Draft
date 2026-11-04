export const APPLE_RECENT_PATH = '/v1/me/recent/played/tracks';
export function developerConfiguration(token, now = Date.now() / 1000) {
  if (!token) throw new Error('Apple Music is not configured. Set APPLE_MUSIC_DEVELOPER_TOKEN on the server and restart it.');
  // Configuration sanity check only. Apple validates the actual signature.
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'ES256' || !header.kid || !payload.iss || !Number.isFinite(payload.exp) || payload.exp <= now + 60) throw new Error();
  } catch { throw new Error('Apple developer token is malformed or expired. Generate a valid ES256 developer token through your Apple Developer setup.'); }
  return { developerToken: token };
}

export function recentItems(data) {
  if (!data || !Array.isArray(data.data) || data.data.length > 100) throw new Error('Unexpected Apple Music recent-content response.');
  return data.data.map(item => {
    const a = item?.attributes;
    if (!a || typeof a.name !== 'string' || typeof a.artistName !== 'string') return null;
    return { id: String(item.id || ''), title: a.name.slice(0, 1000), artist: a.artistName.slice(0, 500), album: typeof a.albumName === 'string' ? a.albumName.slice(0, 1000) : '', type: String(item.type || '') };
  }).filter(Boolean);
}

export function nextRecentPath(next) {
  if (!next) return null;
  const url = new URL(next, 'https://api.music.apple.com');
  if (url.origin !== 'https://api.music.apple.com' || url.pathname !== APPLE_RECENT_PATH || url.username || url.password || url.hash) throw new Error('Apple returned an unsupported pagination URL.');
  return url.pathname + url.search;
}