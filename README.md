# Service selection and self-reported attribution

## Optional shared Firebase accounts

Payola Reciept uses the real Job Tracker Firebase identity project, with separate owner-only listening snapshots and explicit save/load/delete. The verified public web configuration is built in; no placeholder keys are needed. Firebase rules, authorized domain and browser-key referrer access were updated with owner approval on November 4, 2026, and a disposable real-project browser smoke test passed. **The candidate code still needs deployment to Render**; remove stale `ENABLE_FIREBASE_ACCOUNTS=false` and blank Firebase overrides there. Guest workflows and local session files work without signing in. See [the account setup, security rules, storage design, unresolved deletion risk and tests](./ACCOUNTS.md). Job Tracker's application has not been modified, and coordinated shared-account deletion remains unresolved.

## Local sessions and listening insights

Real, nonempty history displays an unsaved reminder until a session download is requested or its current view is confirmed saved/loaded in cloud. Refresh/close warnings are best-effort, not guaranteed recovery. Browsers cannot confirm a download was kept; CSV and PNG exports are not complete-session backups. Edits made during a cloud save remain unsaved. Missing shared profiles can be completed through **Finish account setup**, without replacing an existing profile or role.

Download session creates a versioned JSON file with normalized records, selected dates, source labels, duplicate audit counts, manual counts and Last.fm declarations. It contains private listening history: keep it private. It excludes saved usernames, API credentials, original file names and original file contents. This is explicit local download/restore, not cloud or automatic browser storage.

Restore validates format/version, benchmark metadata, dates, source consistency and metadata bounds before asking to replace results. Limits are 25 MB and 200,000 records. Rejected files preserve current results. Restored provenance is user-editable, not authenticated, and is disclosed in the history panel, CSV and PNG. Last.fm duration remains unknown; dollar scenarios are disabled until a fresh explicit opt-in. A successful live refresh replaces restored provenance.

Restored Spotify sessions are read-only: original file hashes and imported-JSON byte accounting are not preserved. Use **Clear data** and confirm the reset before adding original files. Large sessions may exceed 25 MB; CSV remains available for summaries. Parsing/validation is local on the main thread and may briefly pause the UI near the limit; session parsing does not yet use a cancellable worker.

Top tracks shows ten artist/title pairs for the displayed period, without cross-service or version matching. Last.fm uses scrobble labels. Manual artist counts never invent tracks. Artist concentration is the top five (or fewer) artists' share of included plays, recorded scrobbles or self-reported counts—not platform royalty-pool share. No discovery dates or actual earnings are inferred.

Choose Spotify, Apple Music, or YouTube Music before choosing a route. Last.fm is recommended for existing scrobblers, never required. Manual counts remain available for all three services; local JSON/ZIP imports are Spotify-only. The separate Apple Music preview shows resources, not playback counts. No YouTube history connector is provided.

Last.fm cannot verify the original streaming service or actual duration. The Last.fm form defaults to mixed/unknown service; choosing an onboarding service shows supported routes without declaring history attribution. A single-service declaration requires confirmation that **all scrobbles in the requested period** came from that service. The declaration is self-reported, not verified, and is committed only with a successful load. Changing the requested range or declared service resets confirmation; changing form controls does not relabel previously loaded history. Filters only narrow the loaded history; comparisons do not establish coverage beyond it.

Only explicitly confirmed Spotify histories can opt into a hypothetical scenario using the existing Duetti 2024 Spotify sample benchmark ($0.003 per scrobble). This is not verified royalties, paid-stream eligibility, or artist take-home. Mixed, unknown, Apple Music, YouTube Music, and other-service histories remain unpriced. No allocations or listening durations are inferred. CSVs and images include source and scenario disclosures. Declarations are retained only in explicit session downloads or cloud snapshots. Optional device storage remembers a Last.fm username and, when requested, the Firebase sign-in; listening history is not automatically persisted.

# Payola Reciept

### Guided local imports

Imports also enforce a normalized-history size limit below the 25 MB full-session limit, reserving 64 KiB for metadata. A file that would exceed this limit is rejected before staging and does not consume hashes, duplicate accounting or byte allowance. Download your current session before starting a separate history with Replace. Summary CSVs are not full backups. Existing files above the download limit are not repaired or split automatically.

The main page is organized into Add listening, Dashboard, and Keep your history workspaces. Optional accounts live beside local backups and can be opened from the header without connecting automatically. Source/exclusion details and the top-track list expand on demand. The main workspace styles are isolated in `workspace.css`; the experimental Apple preview retains its existing layout. Keyboard navigation includes a skip-to-dashboard link and pressed states for source controls.

No login is required. Choose a service, then Spotify Extended Streaming History JSON/ZIP or **CSV history · unpriced**. File selections are parsed locally in a worker, reviewed, and committed only after **Confirm import**. Add checks duplicates against current history; Replace stages a new history without discarding the old one until confirmation. Failed files are reported individually; only successful files in the review are committed. Cancel discards pending work.

CSV is a user-mapped interchange format, not a direct streaming-service integration. Map exact header names for date (`YYYY-MM-DD`, UTC), artist, track and optional actual milliseconds played. One row means one listening event; playlists, liked songs, track duration and general YouTube watch activity are not evidence of plays. Blank duration remains unknown. All CSV sources, including self-reported Spotify, are unpriced. Matching date/artist/title/duration across CSV files cannot distinguish every same-day listen. Native Apple privacy exports and YouTube Takeout support await validated sanitized fixtures.

Sessions and explicit cloud snapshots preserve CSV source markers and unknown durations. Existing version-1 sessions remain supported; older app versions will reject the new CSV mode rather than price it. Guest history remains temporary—download a private session to preserve it. Artist sorting and Reset view change only the displayed view, not the source history. Help & Privacy is available on the main page.

The display name is **Payola Reciept** (intentional project spelling). Downloaded
files use the `payola-reciept` prefix. The internal `payola-draft-session` format
identifier remains unchanged so existing local files and cloud snapshots continue
to load. Repository/Render URLs, the Firebase project, account IDs and storage
paths are unchanged by this branding update. The original artwork filename below
is retained as an asset provenance reference, not the current display name.

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

A guest-first, Spotify-first listening royalty estimator. Built with HTML, CSS, native JavaScript modules, and a minimal Node.js static server. No analytics, external fonts, or server runtime packages. Optional shared Firebase accounts load a pinned browser SDK only after an explicit connection. Spotify file imports are local; optional Last.fm mode uses a server-side API proxy.

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

### Private receipt collection (local implementation; not deployed)

On the Receipt page, **Start your receipt collection** captures a summary in tab memory and opens Account. The draft survives in-page registration/sign-in, but not reload, tab closure, sign-out or switching away from an existing account. Verified users explicitly refresh their collection, review the captured summary, and confirm each save. Signing in never uploads it.

The collection contains at most 20 summaries, with custom titles, optional private notes, paper/midnight themes, previews, SVG downloads, editing and deletion. Summary fields include displayed source/period/totals/disclosures and up to three artist highlights; no raw events or original files. Saved receipts are not full backups and do not dismiss unsaved-history warnings. Existing explicit full-history snapshots and version 1/2 backup formats are unchanged.

Storage uses owner-only verified-account documents at `payolaUsers/{uid}/receipts/{0..19}`, with version-checked transactions and empty deletion tombstones. New local Firestore rules must be reviewed and explicitly deployed before this works in production. No production rules/configuration were changed. Delete collection receipts separately from the full-history cloud snapshot before shared-account removal. There is no public gallery, background saving, named-snapshot library or automatic timeline in this increment.

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

Files are parsed in the current browser tab. History is not automatically persisted, uploaded, or included in server logs. Only an explicit cloud Save uploads normalized listening history; original files are not uploaded. Normalization drops unrelated fields (including IP addresses and account identifiers). Clear data or refresh to discard the open view; saved cloud snapshots require separate deletion. SHA-256 fingerprints skip identical JSON contents even when renamed or extracted from another archive. Overlap checks compare full timestamps, track URI, artist/title, and duration, retaining the greatest occurrence count found in a single file. Repeated identical events within one file are retained. Invalid records without an identity cannot be deduplicated across different file contents; records with changed metadata/durations cannot reliably be matched. Coverage never guarantees history completeness.

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

Validate additional real-world export fixtures, profile summarization on large histories, and evaluate Apple Music formats before adding another service. Optional shared accounts and explicit private cloud snapshots are implemented; see ACCOUNTS.md for deployment status, security boundaries and remaining cross-app verification.

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

### Focused page navigation

Last.fm requests validate calendar dates before fetching and reject malformed response records, missing playback identifiers, invalid counters, and inconsistent pagination before replacing history. Cancellation is rechecked after fetch/body reads and before a final result is accepted. Restored Last.fm forms reflect the saved self-reported service declaration, but dollar scenarios stay off until fresh opt-in. Errors from superseded import workers are ignored so they cannot cancel a newer selection.

Date filters now derive the selected year from the actual active range, so resetting or applying custom dates cannot leave a stale year selected. Rolling presets preserve years below 100, clamp at the four-digit lower boundary, and comparisons avoid unsupported negative-year windows. Custom filters reject unsupported dates before changing history or session state. Clicking the current page navigation link returns to its heading without adding a history entry. Replacement confirmations explicitly distinguish full session backups from non-restorable CSV summaries/images.

The optional Account page now includes distinct sign-in/create/recovery actions, email verification feedback, explicit shared-name editing, and a reauthenticated password-change form. Cloud controls show local session size eligibility and preserve checked cloud state when a local session is too large. Account changes queue safe reinitialization; profile/cloud reads time out without authorizing stale results, while uncertain writes remain single-flight. See `ACCOUNTS.md` for shared-profile boundaries and the still-required real-email/Job Tracker release checks. Shared email changes and account deletion remain intentionally unavailable.

The main site uses distinct URL-based views: `/` (home), `/dashboard`, `/import`, `/receipt`, `/history`, `/account`, and `/help`. The Node server explicitly serves the application shell for these paths; unknown paths remain 404s. Internal navigation uses browser history without a document reload, so loaded listening, filters, pending import reviews, and account state survive page changes. Back/Forward restores page positions; new pages start at the top and move keyboard focus to their heading. The skip link targets the current main content. Opening a route in a new tab or refreshing starts a clearly labeled fictional sample, not a silently persisted personal history. Download a session or explicitly save to cloud before closing or reloading personal data.

The receipt has a dedicated, non-sticky page with source/date context and responsive paper styling. Dashboard tables scroll within their own container on narrow screens rather than expanding the page. Account/cloud controls are separate from local backups; navigation to Account does not initiate authentication or upload history. The unsaved-history notice remains available across page views.

Run `TEST_URL=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:navigation:browser` alongside the existing main/cloud browser suites. This checks direct routes, Back/Forward scroll restoration, filter and pending-review preservation, unpriced receipts, PNG download, dialog scroll locking/focus return, keyboard navigation, guest network isolation, and 35 responsive route combinations. Browser suites are optional local checks, not currently part of CI.

The About this history panel shows source, service attribution, original Last.fm request/declaration period, observed record dates, displayed dates, duration availability, valuation method and audit warnings. Filtering does not extend or rewrite a declaration. Choosing a service displays supported acquisition routes without automatically opening Last.fm. Switching services asks for confirmation before clearing loaded personal data or cancelling in-progress work. Cancelling leaves the previous selection and history unchanged.

## Private-beta deployment readiness

## Local listening exploration

- **Guided CSV import:** enabled by default. Choose files, map detected columns with dropdowns, preview normalized rows and validation totals, then stage the selection for the existing confirmation review. Files in one guided selection must have identical headers/order. Mapping changes invalidate the preview. Cancel discards staged work without changing listening. Advanced users can disable guidance and use exact-header mapping. Column preferences are saved only when explicitly selected; the saved preference contains column names, not listening records. A Forget saved mapping action removes it. Inspection runs in the import worker and retains the existing size limits.
- **Data quality:** the dashboard shows included/excluded records, duplicate occurrences, known/unknown duration and observed date bounds. Per-file accepted/rejected/identical-file results are kept in this tab (latest 500 reports), not session backups. Diagnostics download explicitly includes only counts, file ordinals/statuses and date coverage—no filenames, artists, tracks or raw events. Dates can still be personal. Invalid records are not assignable to a date range, and duplicate totals are separate from retained-record totals.
- **Personal recap:** uses existing latest-month/year/custom dashboard filters, with top artists/tracks, duration when available, concentration and previous equal-length-period context. Unpriced recap-card downloads remain explicit. Missing dates are not proof of zero listening; sample/restored provenance remains visible.
- **Multiple manual artists:** add/remove up to 100 rows, edit counts, and explicitly regenerate the receipt. Exact duplicate names are combined; the total is capped at 10,000,000 plays. Dates, duration, tracks and eligibility are never invented. Existing single-artist version-1 backups remain supported. Multi-artist backups use version 2 and cannot be opened by older builds; current local/cloud restoration supports both formats. Cloud envelope/rules and explicit-save behavior are unchanged.
- **Artist deep dives:** artist dialogs show first/last observed dates, monthly counts, listening share and previous-period change, alongside existing top tracks. Observed dates are not discovery dates and do not establish complete coverage.
- **Timestamp patterns:** newly normalized Spotify histories retain a validated UTC timestamp when the source supplies a precise timestamp. Optional timestamps round-trip through current session files. Hour/day-of-week counts, busiest days and longest observed consecutive-day runs use only included records with validated timestamps and show subset coverage. UTC is explicit; source timestamps may describe playback end. Date-only CSV, Last.fm and old backups never generate inferred hourly patterns.
- **Local comparison:** choose two full-session files on Saved history. Comparison respects each file's filters and source/declaration metadata, reports exact artist/title overlap and listening-share changes, and never replaces/merges/uploads the open view. Comparison downloads contain artist names/date coverage and require explicit confirmation. Clear comparison removes selected files and results.
- **Receipt customization:** choose top 5/10 artists, plays or known hours, source-appropriate or unpriced cards, and cream/night/mint themes. Preview before downloading; preview blob URLs are released on close. Hours cards are unpriced. Source, UTC coverage, restored/sample provenance and applicable historical-scenario disclosures cannot be removed. Neither images nor diagnostics/comparisons are full-history backups.

Run `TEST_URL=http://127.0.0.1:3000 PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:features:browser` for guided imports, preference opt-in, diagnostics privacy, multi-artist restoration, comparison isolation, timestamp patterns, receipt preview/export and responsive-layout checks. `npm test` includes pure exploration/session regressions. Live service checks and large-history/mobile performance profiling remain release tasks. No public sharing, automatic history persistence, native Apple/YouTube importers or additional royalty precision were introduced.

## Private-beta release checks

Apple preview preparation bounds configuration loading and allows retry after a timeout. Preparation, authorization and disconnect are serialized so a pending SDK disconnect cannot invalidate a new connection. Recent-content requests check cancellation after fetch and response parsing, preserving the existing preview when a request expires. These boundaries are covered with mocked SDK/client regressions; live Apple eligibility and authorization still require manual testing. Unpriced receipt images use whole-receipt or artist duration when available, retain unknown-duration labels, and identify manual counts as self-reported.

Apple SDK configuration, authorization and disconnect have a 20-second UI deadline. An uncertain SDK operation requires the explicit clear-and-reload recovery action; it does not unlock competing SDK operations or claim Apple access was revoked. Late SDK results cannot commit local tokens or preview state. Back/Forward cache restoration clears the local Apple preview and token without fetching content; reconnect explicitly. An interrupted SDK operation still requires reload recovery.

Optional connection availability can be checked again without reloading or replacing guest listening. Artist tables support 100-row pages with search/sort resetting pagination; source and unpriced/scenario rules apply on every page. Import completion offers dashboard, receipt and explicit full-session download actions. Import precondition errors remain beside the file controls, and local session save/restore feedback remains on Saved history rather than existing only in a temporary toast. No listening persistence, upload or cloud save is introduced by these UI changes.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Render Web Service settings, environment variables, health checks, proxy/logging caveats, beta checklist and rollback procedure. Production binds to `0.0.0.0` by default; local development binds to `127.0.0.1`. Override with `HOST` and `PORT`.

`/healthz` reports process liveness without checking upstream services. `/api/integrations` reports only configuration booleans, never credentials. The dashboard disables Last.fm when unavailable and hides the Apple preview link unless explicitly enabled and configured. Configuration presence is not live integration verification. Apple now requires `ENABLE_APPLE_PREVIEW=true` as well as a structurally valid, unexpired developer token. Keep it disabled for the initial beta.

`.env.example` documents optional local settings; copy it to `.env` and use `node --env-file=.env server.js` if desired. `npm start` does not load local environment files automatically. Real keys and private signing files must never be committed. `.node-version` pins the deployment/CI runtime; the GitHub Actions workflow runs unit/server tests and syntax checks, not browser tests or deployment.
