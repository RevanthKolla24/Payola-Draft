# Optional shared accounts — real Firebase project

## Receipt collection — local, undeployed

Phase 1 adds a separate private receipt-summary collection with 20 fixed slots under `payolaUsers/{uid}/receipts/{slot}`. Verified owners alone may read/write; Job Tracker admins have no exception. Transactions enforce incrementing versions, including empty tombstones on deletion, to detect stale-device edits and prevent raw-history storage through the receipt schema. The client validates loaded summaries and rejects unknown fields; rules bound every field and slot.

Drafts exist only in tab memory. Guest preparation and in-page signup do not upload; users refresh, review and confirm each save. Changing an existing account/signing out clears collection data and drafts immediately; epoch guards reject stale completions. Reads have a 12-second deadline and writes share the existing single-flight account lock. Uncertain writes require a refresh before retry. Receipt saves do not mark listening history as backed up. Deleting a snapshot does not delete receipts, and vice versa.

The new local rules require an approved release before production use. No configuration, rules deployment or production data changes are included. Receipt previews/downloads use escaped text, never stored HTML; downloaded SVGs contain disclosures and no external resources.

## Local account expansion (not deployed)

### Follow-up reliability fixes

Account operations now capture an identity epoch: stale timers, failures, conflicts and write/load completions cannot change the next account's status, cloud version or preservation state. Intentional identity transitions during connection/sign-in/sign-out adopt their resulting epoch; queued setup checks its epoch between profile and cloud reads. Registration waits for profile creation to settle instead of releasing the operation lock after a timeout. A delayed write keeps account controls disabled with confirmation-pending feedback, while navigation and local listening remain available. Cloud loads have a single 12-second deadline across metadata and all chunks; late reads stop the abandoned sequence and cannot restore history. Verification resend cooldown starts only after a successful send. A separate email-return notice survives connection and later operation status updates without claiming successful verification/reset. The mocked browser adapter now uses `onIdTokenChanged`, including token-refresh notifications, to exercise the production observer path.

The Account page is open by default and separates sign-in, registration, password recovery, shared profile names, security, and explicit cloud history. Guest navigation never connects Firebase. Names are read as missing/incomplete/complete; create-only missing-profile recovery remains unchanged. Explicit name updates use a transaction updating only `firstName` and `lastName`, preserving roles, creation metadata and unrelated fields. An email mismatch blocks editing and requests owner review rather than silently changing shared email. Existing Firestore rules already permit these bounded name updates; no rules deployment is needed.

Password changes require the current password and Firebase reauthentication, validate the 12–128-character cross-app policy, and clear password inputs on completion/error. Signed-in users can also request recovery email. Verification/reset emails retain Firebase's hosted handler and use a fixed same-origin `/account?emailAction=verify|reset` return address. Returning is not proof of success. Firebase authorized domains/email templates must support the deployed origin; real inbox delivery, expired-link handling in the hosted handler, and full Job Tracker sign-in with the new password remain manual release checks. Successful verification sends start a 60-second UI cooldown; returning to a visible tab can refresh an unverified account, at most once per 30 seconds. SDK token changes trigger identity-aware refreshes. No session-device inventory, revoke-all endpoint, email change, or shared-account deletion is claimed or implemented.

Profile/cloud reads have 12-second caller timeouts; late reads cannot update application state. Retrying a read is safe. Writes remain single-flight until confirmation (the pending-write warning is not a cancellation). Account changes during operations queue setup for the latest identity. Cloud size is measured locally before Save becomes available; payload encoding is also validated before cloud version invalidation or upload confirmation. A local oversized session leaves previously checked cloud state usable for load/delete. Saved timestamps are shown when available from Firestore metadata. Password visibility, input values and Remember choices reset on identity changes/sign-out.

Local validation includes helper/profile tests, the mocked account/cloud browser flows, and emulator name-update/role-preservation tests. These tests do not certify real email delivery, password policy configuration, deployed code, or cross-app behavior. No production configuration, accounts, templates, API restrictions, rules or data were modified for this expansion.

## Production configuration verified November 4, 2026

**November 5 status update:** a read-only production review confirmed that live
`/api/accounts` now returns `enabled: true`, the deployed Firestore rules match this
repository, and the browser key still has website/API restrictions. Earlier notes
below describing Render as disabled or awaiting deployment are historical, not a
current deployment assertion. The deployed commit and complete real-email/cross-app
flows still need verification. See `SECURITY.md` for the secret-scanning alert
review and the remaining broad API-allowlist follow-up; no key was revoked or alert
dismissed in that review.

The candidate application now includes the real public web configuration verified using Firebase CLI for `job-tracker-project-c4e87`. No keys need to be copied to Render for the normal shared-project setup. Accounts are enabled by default; `ENABLE_FIREBASE_ACCOUNTS=false` is an explicit emergency off switch. If overriding configuration, all four public Firebase environment variables are required; partial/blank overrides disable accounts instead of mixing projects.

With explicit owner approval, the replacement `firestore.rules` was compiled and published to the real project, the Payola Render hostname was added to Firebase Authentication authorized domains, and that origin was added to the existing web key's browser referrer allowlist. Existing Job Tracker referrers and all API target restrictions were preserved. No index deployment, billing change, or Job Tracker application deployment was performed. Pre-change rules, domains and key restrictions were backed up under `/tmp/payola-firebase-production-backup` on the development machine; keep a durable private copy if needed because temporary storage is not permanent.

**Render deployment:** deploy this candidate code, remove any stale `ENABLE_FIREBASE_ACCOUNTS=false`, and remove blank/partial `FIREBASE_*` overrides. The normal configuration needs no overrides. The public `/api/accounts` response must show `enabled: true`. HTML uses `Referrer-Policy: strict-origin` when accounts are enabled: this sends only the website origin, never URL paths or query strings, so Google's browser-key restrictions can validate it. Production credentials should never be put in URLs.

Real-project browser smoke testing passed with a disposable identity: registration, compatible profile creation, verification request, admin-assisted verification of that test identity only, password sign-in in a second isolated browser context, save/load/delete, and cross-UID/admin-role escalation denial. Candidate code was served under the authorized Payola origin while Google requests used real production APIs. The disposable account and its cloud/profile documents were removed after testing. Email inbox delivery/link completion, a full Job Tracker UI round trip, physical devices and the new Render deployment are not yet verified. This is more than a mock test, but not a claim that all production workflows are certified.

## Behavior and boundaries

### Profile recovery and history-loss protection

After sign-in, remembered connection, registration or verification refresh, Payola checks whether the shared `users/{uid}` profile exists. Failed checks offer an explicit retry without claiming the profile is missing. Missing profiles show a first/last-name form. **Finish account setup** uses a create-only transaction: an existing or concurrently created profile is never updated, including any roles. Names are bounded to 100 characters; UID/email come from the signed-in identity. Account changes discard pending results. This does not repair incomplete fields in an existing profile or grant any role. No rules changes are needed.

A separate session-backup tracker shows a persistent reminder and attaches a best-effort refresh/close warning only for real, nonempty history without a recorded current-session download or confirmed cloud save/load. Cosmetic controls, CSVs and images do not count as complete backups. Cancelled downloads/restores and rejected operations do not clear the reminder. Edits made during a cloud save remain unsaved. Local restores are conservatively treated as a new view to back up, since validation may normalize content and disable saved scenarios. A download request cannot confirm that the browser/user retained the file, and browsers may suppress close warnings. Clearing/signing out of the cloud account invalidates its backup acknowledgement; independent session-download acknowledgement remains.

Every new cloud-status check immediately clears the previous write version and recovery acknowledgement. A failed network/permission check leaves Save/Delete disabled until a successful check. Only a freshly inspected, recoverable metadata error enables the explicit damaged-snapshot reset path.

Guest mode is unchanged. The account SDK is loaded only after **Sign in or create an account**. Firebase web SDK 13.2.0 is pinned, with Auth and Firestore only (no analytics or Cloud Storage). Email/password identities use the existing `job-tracker-project-c4e87` project, so a verified identity works in either app. Each origin signs in separately. The optional Remember checkbox persists only the account sign-in, not listening history. Signing out keeps the local view by default. An explicit checkbox and confirmation can also clear the view and remembered Last.fm username; this does not delete cloud history, jobs, downloaded files or the shared account.

Password visibility controls are available for both password fields. Verification refresh reloads the identity and refreshes its token before checking cloud access. Local import, Last.fm and restore busy-state changes immediately refresh cloud controls. Restored history identifies local-session versus cloud-snapshot restoration independently of the declared listening source.

Cloud requests remain single-flight until they settle. After 12 seconds the UI explains that a pending write may still complete; it does not report cancellation or unlock a duplicate write. Local downloads remain available when local processing is idle. Version conflicts disable Save until a fresh status check, with visible choices to keep the local view, load cloud history, or explicitly replace the checked version. Edits made during Save remain marked unsaved; edits or account changes during Load cannot replace the local view.

Damaged metadata disables normal saves. If it retains a positive safe version below the version limit, status checking offers an explicit reset through the existing Delete control. A transaction compares the inspected metadata again, advances the version, writes a deletion tombstone and clears all 16 slots. Rules are unchanged. Missing/invalid versions require trusted administrative repair; there is no client bypass or automatic deletion.

Account tools start collapsed under **Account & cloud** and can be expanded with the keyboard. Connecting an already remembered verified identity checks cloud status without loading or uploading history. Cloud Save is unavailable for empty history. Rejected/cancelled local restores preserve the saved-state indicator, and registration reports partial profile/verification failures without implying that the login must be recreated. Deletion is separated into an expandable destructive-action section. Layouts support reduced motion and mobile-sized controls.

Registration asks for names to create a Job Tracker-compatible `users/{uid}` profile, without assigning any role. Account creation and profile creation are not atomic: if the profile write fails, the login still exists. Verification can be resent without recreating the account. Password reset affects both apps. There is no automatic history upload, merge, download on sign-in, or background sync. Users must explicitly save/load/delete. Cloud failures leave local history intact. Restored sessions are unverified; Last.fm dollar scenarios require a fresh opt-in.

## Snapshot storage

* `payolaUsers/{uid}/state/current`: schema, monotonically increasing version, UTF-8 byte count, chunk count, deletion flag and server timestamp.
* `payolaUsers/{uid}/chunks/{0..15}`: fixed slots containing bounded UTF-8 strings and their snapshot version.
* Maximum cloud payload: **4 MiB**, at most 16 chunks of 256 KiB each. Local download/restore retains its existing 25 MB / 200,000-record cap. Unicode boundaries can require one extra chunk near the cap; such a save is rejected before writing.
* One transaction writes metadata and all sixteen slots. Old slots are overwritten, including unused slots. No staging generations or orphan snapshots remain. The payload field is exempted from indexing. This deliberately trades full-size cloud sessions for bounded atomic replacement.
* Save/delete require the version last observed by that tab. Transactions reject concurrent updates. Check cloud status acknowledges a newer version; Load reads server-only chunks and rechecks metadata before replacing the local view. It never silently merges or retries an overwrite against a newly observed version.
* Delete replaces content with empty slots and a version tombstone; it is not shared-account deletion. The small marker prevents a deleted/recreated snapshot from matching a stale version. Google-managed backups/log retention, if enabled by the project owner, is outside this client deletion mechanism.
* Limits bound retained client-writable cloud documents per UID, not total request frequency or project costs. Free quotas can still be exhausted. No billing or Storage changes are needed or performed. Do not describe rules as a rate limiter.

## Shared rules: review before publishing

`firestore.rules` is a **replacement**, not an additive patch, and has now been published with owner approval. The old broad profile-write grant was removed; overlapping allows cannot make it restrictive. This replacement retains own-job reads/writes, owner profile reads and verified admin profile/collection-group job reads. Admin status still uses the existing profile role, but clients cannot create, change or remove that field, or delete a role-bearing profile. Existing admin assignments must still be independently audited in the console: the new rules cannot prove that old role values were assigned legitimately.

Payola permits only verified owners to read/write their own fixed namespace, with no admin exception. Unknown paths are denied. The rules bound storage shape and enforce revision increments; client validation checks session format, byte counts, provenance and chunk consistency on load. A modified owner client can corrupt its own snapshot, not access another user's listening history. Do not use these user-editable declarations as evidence of actual earnings or verified history.

The actual pre-change deployed rules and current authentication settings were inspected before replacement. The public Job Tracker repository was inspected, but full compatibility with production data is not certified. Profile creation before verification remains allowed for Job Tracker registration. The existing owner-only job access is retained without imposing a new verification requirement. Job Tracker profile deletion is denied for role-bearing profiles; those accounts need trusted administrator cleanup.

## Launch blocker: shared account deletion

Job Tracker currently offers deletion of the Firebase Authentication identity without coordinated Payola cleanup. **This remains an unresolved production risk, not a completed feature.** There is no trusted cross-app deletion endpoint in this project. Enabling sign-in does not solve this issue, and the Job Tracker deployment was not changed under this task.

Required Job Tracker follow-up (not modified here): distinguish “delete jobs”, “delete Payola history” and “delete shared account”; explain that login/password changes affect both apps; require recent authentication; clear both apps' private data before deleting Auth; handle partial cleanup and retry. A trusted backend/admin workflow is required for reliable recursive deletion and role-bearing profiles. Firebase Auth deletion alone is not database cleanup. Until this exists, the Payola UI warns users and offers only Payola-history deletion, never shared-account deletion.

## Owner follow-up and future deployments

1. Back up the existing deployed rules and indexes; audit every existing `role: admin` assignment through a trusted console/admin path. Review Job Tracker flows and the rule differences. Keep the feature off meanwhile.
2. Run the emulator tests below and manual cross-app tests using disposable accounts. No production credentials are needed for emulators.
3. Review `firestore.indexes.json`. **Merge its `chunks.data` exemption into the existing index configuration; do not blindly deploy the empty `indexes` array over Job Tracker indexes.** Existing collection-group indexes must be preserved. The payload exemption also affects any other collection named `chunks`; inspect before applying it.
4. The reviewed replacement rules were published with explicit owner approval to `job-tracker-project-c4e87`. Indexes were NOT deployed; preserve all existing indexes if applying the payload exemption later. Never deploy against an inferred/default project.
5. In Firebase Authentication, confirm Email/Password is enabled; add the Payola origin to Authorized domains; review verification/reset email templates, action URLs, password policy and API-key restrictions for both origins. The standard Firebase-hosted email action handler is used here; test it rather than reusing Job Tracker's custom handler implicitly.
6. The verified public shared-project configuration is built in. No environment overrides are required. Remove stale false/blank settings from Render and deploy the candidate code. No service-account key, Admin SDK credential or private key belongs in these variables. Explicit false or incomplete overrides disable accounts.
7. Complete the remaining real workflows: email inbox/link completion, password-reset link completion, full Job Tracker UI interoperability in both directions, remembered sessions, offline behavior, and coordinated shared-account cleanup. Test Safari/Firefox and physical phones. The real-project candidate smoke tests described above passed, but do not certify these remaining workflows or the deployed Render build.

## Reproducible tests

The application remains build-free. Optional test dependencies may be installed outside the project:

```sh
npm install --prefix /tmp/payola-firebase-tests --no-audit --no-fund firebase@13.2.0 @firebase/rules-unit-testing@6.0.0
FIREBASE_TEST_MODULES=/tmp/payola-firebase-tests/node_modules npm run test:rules
npm test
npm run check
PORT=3001 npm start
# In another terminal, use your installed Playwright module path:
TEST_URL=http://127.0.0.1:3001 PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
TEST_URL=http://127.0.0.1:3001 PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:cloud:browser
```

Rules tests require Firebase CLI and Java 21. They target only `demo-payola-shared`. The rules suite uses emulated verified/unverified identities; the cloud browser suite mocks the Firebase adapter but exercises the actual UI and snapshot store. Neither constitutes real-project email delivery or cross-app end-to-end certification.