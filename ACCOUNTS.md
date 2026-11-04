# Optional shared accounts — local implementation, not deployed

## Behavior and boundaries

Guest mode is unchanged. The account SDK is loaded only after **Connect account service**. Firebase web SDK 13.2.0 is pinned, with Auth and Firestore only (no analytics or Cloud Storage). Email/password identities use the existing `job-tracker-project-c4e87` project, so a verified identity works in either app. Each origin signs in separately. The optional Remember checkbox persists only the account sign-in, not listening history. Signing out leaves the local view visible; clear it or close the tab on shared devices.

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

`firestore.rules` is a **replacement draft**, not an additive patch. Remove the old broad profile-write grant; overlapping allows cannot make it restrictive. This replacement retains own-job reads/writes, owner profile reads and verified admin profile/collection-group job reads. Admin status still uses the existing profile role, but clients cannot create, change or remove that field, or delete a role-bearing profile. Existing admin assignments must be independently audited in the console: the new rules cannot prove that old role values were assigned legitimately.

Payola permits only verified owners to read/write their own fixed namespace, with no admin exception. Unknown paths are denied. The rules bound storage shape and enforce revision increments; client validation checks session format, byte counts, provenance and chunk consistency on load. A modified owner client can corrupt its own snapshot, not access another user's listening history. Do not use these user-editable declarations as evidence of actual earnings or verified history.

Compare against the **actual deployed rules** and all production Job Tracker queries/profile fields before replacement. The public repository was inspected, but compatibility with production data and settings is not certified. Profile creation before verification remains allowed for Job Tracker registration. The existing owner-only job access is retained without imposing a new verification requirement. Job Tracker profile deletion is denied for role-bearing profiles; those accounts need trusted administrator cleanup.

## Launch blocker: shared account deletion

Job Tracker currently offers deletion of the Firebase Authentication identity without coordinated Payola cleanup. **Do not enable shared accounts for launch until this is fixed in Job Tracker.** There is no trusted cross-app deletion endpoint in this project.

Required Job Tracker follow-up (not modified here): distinguish “delete jobs”, “delete Payola history” and “delete shared account”; explain that login/password changes affect both apps; require recent authentication; clear both apps' private data before deleting Auth; handle partial cleanup and retry. A trusted backend/admin workflow is required for reliable recursive deletion and role-bearing profiles. Firebase Auth deletion alone is not database cleanup. Until this exists, the Payola UI warns users and offers only Payola-history deletion, never shared-account deletion.

## Owner setup, after review and deletion coordination

1. Back up the existing deployed rules and indexes; audit every existing `role: admin` assignment through a trusted console/admin path. Review Job Tracker flows and the rule differences. Keep the feature off meanwhile.
2. Run the emulator tests below and manual cross-app tests using disposable accounts. No production credentials are needed for emulators.
3. Review `firestore.indexes.json`. **Merge its `chunks.data` exemption into the existing index configuration; do not blindly deploy the empty `indexes` array over Job Tracker indexes.** Existing collection-group indexes must be preserved. The payload exemption also affects any other collection named `chunks`; inspect before applying it.
4. Only after explicit owner approval, publish the reviewed replacement rules and merged index exemption to `job-tracker-project-c4e87`. No deployment was performed by this change. Never deploy against an inferred/default project.
5. In Firebase Authentication, confirm Email/Password is enabled; add the Payola origin to Authorized domains; review verification/reset email templates, action URLs, password policy and API-key restrictions for both origins. The standard Firebase-hosted email action handler is used here; test it rather than reusing Job Tracker's custom handler implicitly.
6. Populate the public web config values shown in `.env.example` from this same Firebase project. No service-account key, Admin SDK credential or private key belongs in these variables. Finally set `ENABLE_FIREBASE_ACCOUNTS=true` and restart/redeploy Payola. It remains false/unavailable by default, including if configuration is incomplete.
7. Verify with real disposable accounts: signup in each direction, verification, sign-in on both origins, password reset, optional remembered sign-in, two devices, same-account conflicts, cross-user denial, offline failures, delete history and shared-account cleanup. Test Safari/Firefox and physical phones. These real-project checks have not been performed.

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