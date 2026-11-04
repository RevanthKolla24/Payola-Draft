# Service selection and self-reported attribution

## Optional shared Firebase accounts

Implemented locally, **disabled by default and not deployed**. Payola Draft can use the existing Job Tracker Firebase identity project, with separate owner-only listening snapshots and explicit save/load/delete. Guest workflows and local session files still work without signing in. See [the account setup, security rules, storage design, launch blockers and test instructions](./ACCOUNTS.md) before enabling anything. No rules have been published and Job Tracker has not been modified. Coordinated shared-account deletion in Job Tracker remains a launch blocker.

## Local sessions and listening insights

Download session creates a versioned JSON file with normalized records, selected dates, source labels, duplicate audit counts, manual counts and Last.fm declarations. It contains private listening history: keep it private. It excludes saved usernames, API credentials, original file names and original file contents. This is explicit local download/restore, not cloud or automatic browser storage.

Restore validates format/version, benchmark metadata, dates, source consistency and metadata bounds before asking to replace results. Limits are 25 MB and 200,000 records. Rejected files preserve current results. Restored provenance is user-editable, not authenticated, and is disclosed in the history panel, CSV and PNG. Last.fm duration remains unknown; dollar scenarios are disabled until a fresh explicit opt-in. A successful live refresh replaces restored provenance.

Restored Spotify sessions are read-only: original file hashes and imported-JSON byte accounting are not preserved. Use **Clear data** and confirm the reset before adding original files. Large sessions may exceed 25 MB; CSV remains available for summaries. Parsing/validation is local on the main thread and may briefly pause the UI near the limit; session parsing does not yet use a cancellable worker.

Top tracks shows ten artist/title pairs for the displayed period, without cross-service or version matching. Last.fm uses scrobble labels. Manual artist counts never invent tracks. Artist concentration is the top five (or fewer) artists' share of included plays, recorded scrobbles or self-reported counts—not platform royalty-pool share. No discovery dates or actual earnings are inferred.

Choose Spotify, Apple Music, or YouTube Music before choosing a route. Last.fm is recommended for existing scrobblers, never required. Manual counts remain available for all three services; local JSON/ZIP imports are Spotify-only. The separate Apple Music preview shows resources, not playback counts. No YouTube history connector is provided.

Last.fm cannot verify the original streaming service or actual duration. The Last.fm form defaults to mixed/unknown service; choosing an onboarding service shows supported routes without declaring history attribution. A single-service declaration requires confirmation that **all scrobbles in the requested period** came from that service. The declaration is self-reported, not verified, and is committed only with a successful load. Changing the requested range or declared service resets confirmation; changing form controls does not relabel previously loaded history. Filters only narrow the loaded history; comparisons do not establish coverage beyond it.

Only explicitly confirmed Spotify histories can opt into a hypothetical scenario using the existing Duetti 2024 Spotify sample benchmark ($0.003 per scrobble). This is not verified royalties, paid-stream eligibility, or artist take-home. Mixed, unknown, Apple Music, YouTube Music, and other-service histories remain unpriced. No allocations or listening durations are inferred. CSVs and images include source and scenario disclosures. Declarations are retained only in explicit session downloads or cloud snapshots. Optional device storage remembers a Last.fm username and, when requested, the Firebase sign-in; listening history is not automatically persisted.

# Payola Draft

## Visual identity

The original artwork is `final logo payola draft.png`. Padded square derivatives in `assets/` provide the header/footer logo, 32px and 192px favicons, and 180px Apple touch icon. Only these web derivatives are publicly served; the original is preserved unchanged.

The theme tokens at the top of `styles.css` use logo cream (`#F9EFDF`), plum (`#523A56`), and pastel chart/highlight accents. PNG exports read these same tokens and include the local logo, with a text-only fallback if the image cannot load. No external image service or runtime dependency is required.

## Apple Music connection proof of concept

Choose Apple Music and select **Experimental Apple Music preview** when it is enabled/configured, or open `/apple.html` (connection remains disabled unless enabled by the owner). This experimental page is intentionally separate from the royalty dashboard. It authorizes through MusicKit on the Web and requests `/v1/me/recent/played/tracks` directly from Apple, with explicit next-page loading capped at ten pages. It displays recent resource metadata only: no inferred play counts, timestamps, actual duration, period statistics, or royalties. Catalog track duration is deliberately discarded. There is no claim of full listening history or continuous synchronization.

Owner setup:

1. Configure MusicKit through your Apple Developer account and generate a signed developer token with a MusicKit-enabled key.
2. Keep the private signing key outside the project. Never place it in client code or commit it.
3. Start the server with `ENABLE_APPLE_PREVIEW=true APPLE_MUSIC_DEVELOPER_TOKEN=your_signed_token npm start` (combine with `LASTFM_API_KEY` if using both).
4. Open the preview, prepare the connection, then authorize through Apple. Use HTTPS in deployment and review Apple account eligibility and platform terms.

The configuration endpoint checks token structure, ES256 metadata and expiration; it does not verify the signature. Apple does that. The signed developer token is intentionally exposed to the browser SDK; it is not the private signing key. The Music User Token is held in app memory and sent directly to Apple, never through the app server. Apple SDK authorization may use its own storage/cookies. Disconnect calls MusicKit unauthorize and clears the displayed list and in-memory token; account-level revocation remains under Apple's controls.

No SDK is fetched until the user selects Prepare and valid server configuration is available. Only the preview page allows Apple's SDK, API and authorization hosts through CSP; other pages retain the existing same-origin policy. The production Apple SDK/network path may require further CSP verification with real credentials. The browser test stubs MusicKit and Apple's API, covering authorization plumbing, pagination, safe rendering, disconnect, absent configuration and responsive layouts. **No real Apple authorization has been completed without a developer token.**

References: https://developer.apple.com/musickit/ · https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks · https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens

Spotify OAuth is not implemented in this release. Current development-mode limits and public-launch access must be resolved first: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide . YouTube Music, TIDAL and Napster connections remain unsupported; no scraping or session-cookie collection is used.

Your listening. By the numbers.

A dependency-free, Spotify-first listening royalty estimator. Built with HTML, CSS, native JavaScript modules, and a minimal Node.js static server. No app accounts, analytics, external fonts, or runtime packages. Spotify file imports are local; optional Last.fm mode uses a server-side API proxy.

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

Request Extended Streaming History from Spotify and select the downloaded ZIP or extracted audio-history JSON files. Required fields: `ts`, `ms_played`, `master_metadata_album_artist_name`, `master_metadata_track_name`, and `spotify_track_uri`. Standard account exports, Apple Music, and YouTube are not supported by the file importer. Last.fm is available through a separate API source. Unrelated JSON files in a ZIP receive individual feedback without blocking valid history files.

Files are parsed in the current browser tab. No history is persisted, uploaded, or included in server logs. Normalization drops unrelated fields (including IP addresses and account identifiers). Clear data or refresh to discard history. SHA-256 fingerprints skip identical JSON contents even when renamed or extracted from another archive. Overlap checks compare full timestamps, track URI, artist/title, and duration, retaining the greatest occurrence count found in a single file. Repeated identical events within one file are retained. Invalid records without an identity cannot be deduplicated across different file contents; records with changed metadata/durations cannot reliably be matched. Coverage never guarantees history completeness.

Select up to 100 MB compressed input and 100 MB expanded JSON per selection. ZIP entries are read in memory, never extracted to disk. The ZIP reader supports stored and raw-DEFLATE entries, verifies size and CRC32, and rejects encrypted, multi-part, ZIP64, unsupported-compression, or oversized archives. At most 5,000 ZIP directory entries are accepted. Browsers without `DecompressionStream('deflate-raw')` should unzip first. SHA-256 uses Web Crypto, requiring localhost or HTTPS. Reading, decompression, hashing, parsing, normalization and deduplication run in a dedicated module worker. Cancel terminates that worker and discards the entire pending selection; previously committed history is unchanged. Successful files in a completed selection are committed together, with feedback for rejected files. Session limits cap successfully imported JSON at 100 MB and retained records at 200,000. These are conservative data limits, not an exact RAM guarantee; transient parsing and structured-clone copies require additional memory. Summarization and rendering still run on the main thread. Browser storage is not used for histories. A Last.fm username may be remembered only through explicit opt-in. The development server binds only to localhost and serves an explicit allowlist of public files.

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

Validate additional real-world export fixtures, profile summarization on large histories, and evaluate Apple Music formats before adding another service. User accounts and cloud persistence are intentionally outside this MVP.

## Comparisons and CSV export

Date presets use the latest date in the loaded files, not the current date. Latest month runs from its first day to the latest observed date; latest 12 months runs from the first day of the month eleven months earlier through that latest date. Year selection uses the full calendar year. Comparisons use the immediately preceding equal-length inclusive UTC-day window, not necessarily the previous calendar month. Coverage warnings reflect observed endpoints only; gaps and completeness cannot be established. Zero previous plays produce no percentage change. Artist changes are percentage-point changes in personal listening share. New in this period does not mean newly discovered.

CSV downloads include a TOTAL row and all artist rows, regardless of table search, plus source, selected dates, listening hours, personal share, estimate, benchmark source/year/rate, exclusions and assumptions. Invalid counts and duplicate counts apply to all imported dates, as labeled. Manual duration and dates are blank. Formula-like metadata is prefixed with an apostrophe and all fields are quoted; CSV uses UTF-8 BOM and CRLF. CSV rows include benchmark values only for supported priced views or explicitly enabled scenarios, and are not payout statements. Last.fm exports preserve the original request/declaration period separately from displayed dates.

## Browser regression tests

The committed `test/browser.mjs` harness uses Playwright as an optional external test tool; it is not a runtime dependency. Start the server, provide an installed Playwright module with Chromium, and run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
```

`TEST_URL` optionally overrides the local server address. Tests cover real worker ZIP parsing, deterministic worker cancellation, preserved prior results, deduplication, date presets, comparisons, CSV downloads and formula protection, manual mode, artist PNG downloads and four responsive widths. Real-world export samples have not yet been supplied; automated fixtures are synthetic.

## Last.fm integration

Register a Last.fm API application at https://www.last.fm/api/account/create and keep the API key server-side. Restart the server with:

```sh
LASTFM_API_KEY=your_key npm start
```

Do not commit keys or put them in browser code. Without a key, the source displays an actionable configuration error. The app does not need a Last.fm user password, session, or write permission. Commercial use requires reviewing Last.fm terms and contacting Last.fm where required: https://www.last.fm/api/tos . Data is attributed to Last.fm with a user-profile link.

Enter a public username and UTC dates. Load/refresh fetches every page (200 entries per page) for that fixed range, with a maximum of 100 pages. Over-limit, failed, or cancelled requests do not commit partial results; choose a smaller range. Now-playing, malformed, and out-of-range entries are excluded. Identical timestamp/artist/track entries are collapsed, which may collapse truly identical submissions. Scrobbles are recorded listening, not verified royalty-earning streams; actual duration is unknown and service declarations are self-reported. Mixed, unknown and non-Spotify histories remain unpriced. Explicitly confirmed Spotify histories may opt into the clearly labeled historical benchmark scenario; totals, artist cards and CSVs identify it as hypothetical, not verified earnings. Histories from different sources are never merged. Comparisons are scrobble comparisons; hours are unavailable. Refresh is on demand, never scheduled.

The server forwards only validated usernames, dates and page numbers to a fixed HTTPS endpoint, uses a server-side key, limits response size and requests, applies a 15-second timeout, and does not persist history. It permits at most 4 concurrent upstream requests, 120 global requests/minute and 100 requests/minute per direct socket IP. Reverse-proxy deployment must review these limits because socket IPs may represent the proxy rather than individual users. The app does not trust forwarded IP headers. Hosting infrastructure may log query URLs, including usernames. Requests are same-origin and JSON responses have no-store headers; CSP permits same-origin connections only. Production deployment needs HTTPS, abuse protection and an infrastructure logging/privacy review.

Remember username is opt-in local storage; Forget saved username removes it. Clear data discards current history but does not remove a remembered username. No play history is stored in browser storage or persisted on the server. The browser regression suite mocks the Last.fm proxy; live upstream calls require a valid key and have not been tested without one. API references: https://www.last.fm/api/show/user.getRecentTracks and https://www.last.fm/api .

## History context and service switching

The About this history panel shows source, service attribution, original Last.fm request/declaration period, observed record dates, displayed dates, duration availability, valuation method and audit warnings. Filtering does not extend or rewrite a declaration. Choosing a service displays supported acquisition routes without automatically opening Last.fm. Switching services asks for confirmation before clearing loaded personal data or cancelling in-progress work. Cancelling leaves the previous selection and history unchanged.

## Private-beta deployment readiness

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Render Web Service settings, environment variables, health checks, proxy/logging caveats, beta checklist and rollback procedure. Production binds to `0.0.0.0` by default; local development binds to `127.0.0.1`. Override with `HOST` and `PORT`.

`/healthz` reports process liveness without checking upstream services. `/api/integrations` reports only configuration booleans, never credentials. The dashboard disables Last.fm when unavailable and hides the Apple preview link unless explicitly enabled and configured. Configuration presence is not live integration verification. Apple now requires `ENABLE_APPLE_PREVIEW=true` as well as a structurally valid, unexpired developer token. Keep it disabled for the initial beta.

`.env.example` documents optional local settings; copy it to `.env` and use `node --env-file=.env server.js` if desired. `npm start` does not load local environment files automatically. Real keys and private signing files must never be committed. `.node-version` pins the deployment/CI runtime; the GitHub Actions workflow runs unit/server tests and syntax checks, not browser tests or deployment.
