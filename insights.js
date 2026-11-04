export function listeningInsights(summary) {
  const tracks = summary.artists.flatMap(a => [...a.tracks.entries()].map(([title, plays]) => ({ artist: a.name, title, plays })));
  tracks.sort((a, b) => b.plays - a.plays || a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  const topArtists = summary.artists.slice(0, 5).reduce((sum, a) => sum + a.plays, 0);
  return { tracks: tracks.slice(0, 10), concentration: summary.plays ? topArtists / summary.plays * 100 : null, artistCount: Math.min(5, summary.artists.length) };
}