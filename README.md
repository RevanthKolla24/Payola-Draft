# Payola Draft

Your listening. By the numbers.

A dependency-free, Spotify-first listening royalty estimator. Built with HTML, CSS, native JavaScript modules, and a minimal Node.js static server. No accounts, network APIs, analytics, external fonts, or runtime packages.

## Run

Requires Node.js 22.15 or newer (the ZIP tests use native raw-DEFLATE support).

```sh
npm start
```

Open http://localhost:3000. To use another port: `PORT=3001 npm start`.

```sh
npm test
npm run check
```

## Features

- Deterministic fictional sample receipt (clearly labeled).
- Validated manual artist/play-count entry.
- Local multi-file Spotify Extended Streaming History JSON import.
- Artist ranking, search, track details, inclusive UTC date filtering.
- Exclusion audit: short plays, unsupported records, invalid data, and out-of-range plays.
- Locally generated PNG share card; no raw history is included.
- Responsive layout, keyboard controls, native dialogs, reduced-motion support.
- Guided ZIP / JSON import, drag-and-drop, progress, per-file feedback, and import coverage summary.
- SHA-256 file-content checks and occurrence-aware cross-file playback deduplication.
- Expandable calculation and assumptions panel; no unsupported artist-popularity multipliers.
- Monthly plays / listening-hours charts, accessible data table, and personal artist listening shares.
- Artist-specific listening-only and estimated-value PNG cards, including top tracks and listening share.

## Import format and privacy

Request Extended Streaming History from Spotify and select the downloaded ZIP or extracted audio-history JSON files. Required fields: `ts`, `ms_played`, `master_metadata_album_artist_name`, `master_metadata_track_name`, and `spotify_track_uri`. Standard account exports, Apple Music, YouTube, and Last.fm are not supported. Unrelated JSON files in a ZIP receive individual feedback without blocking valid history files.

Files are parsed in the current browser tab. No history is persisted, uploaded, or included in server logs. Normalization drops unrelated fields (including IP addresses and account identifiers). Clear data or refresh to discard history. SHA-256 fingerprints skip identical JSON contents even when renamed or extracted from another archive. Overlap checks compare full timestamps, track URI, artist/title, and duration, retaining the greatest occurrence count found in a single file. Repeated identical events within one file are retained. Invalid records without an identity cannot be deduplicated across different file contents; records with changed metadata/durations cannot reliably be matched. Coverage never guarantees history completeness.

Select up to 100 MB compressed input and 100 MB expanded JSON per selection. ZIP entries are read in memory, never extracted to disk. The ZIP reader supports stored and raw-DEFLATE entries, verifies size and CRC32, and rejects encrypted, multi-part, ZIP64, unsupported-compression, or oversized archives. At most 5,000 ZIP directory entries are accepted. Browsers without `DecompressionStream('deflate-raw')` should unzip first. SHA-256 uses Web Crypto, requiring localhost or HTTPS. Parsing and CRC checks on very large files may briefly pause the UI; background-worker parsing is not yet implemented. Browser storage is not used. The development server binds only to localhost and serves an explicit allowlist of public files.

## Estimation limitations

Included plays are multiplied by **$0.003**, based on Duetti’s **2024 Spotify sample average** of $3 per 1,000 streams. This is intentionally historical, not an assertion about current rates. No fabricated plan, country, or Family multipliers are applied. Imports include music-track records with valid artist/title metadata, dates, and at least 30 seconds played. This does not establish monetization, global track eligibility, actual payments, artist take-home, or contract splits. Publishing royalties are not estimated separately. No statistically unsupported confidence interval is shown.

Imported dates use UTC. Artist attribution follows the exported album-artist field. Each included record is counted once, not distributed across guessed collaborators. The table shows the first 100 matching artists and track detail shows the top 50 tracks; totals always include every qualifying record. Search does not change receipt totals. The share card includes total listening, top three artists, date coverage, source type, and caveats.

Monthly charts include only months with qualifying records; missing months do not prove zero listening. All charts follow the selected dates. Personal listening shares divide an artist’s included plays by the user’s total included plays, not platform-wide streams. The top five artists and an “Other artists” bucket reconcile to the total; displayed percentages are rounded. Artist cards default to listening-only mode, with an explicit option to include the benchmark estimate. Manual entry has no monthly trend or listening duration.

Sources:
- Duetti 2024 report: https://report.duetti.co/
- Duetti release announcing 2024 rates: https://www.prnewswire.com/news-releases/duettis-2024-music-economics-report-finds-industry-wide-per-stream-rates-for-independent-artists-are-finally-stabilizing-following-years-of-decline-302358273.html
- Spotify royalties guide: https://artists.spotify.com/en/royalties-guide
- Spotify export documentation: https://support.spotify.com/us/article/understanding-your-data/
- Spotify streamshare explanation: https://loudandclear.byspotify.com/faqs/how-is-streamshare-calculated/
- Native compression specification: https://compression.spec.whatwg.org/

## Next iterations

Validate additional real-world export fixtures, add worker-based parsing for very large histories, and evaluate Apple Music formats before adding another service. User accounts and cloud persistence are intentionally outside this MVP.