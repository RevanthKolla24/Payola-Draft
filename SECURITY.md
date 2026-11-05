# Security and credential handling

## Public Firebase browser configuration

`firebase-config.js` contains intentionally public Firebase web identifiers. Its
browser API key is not an Admin SDK credential or a service-account private key.
Browser users also receive this configuration from `/api/accounts` when accounts
are enabled. Moving it to environment variables does not make it secret.

Firebase guidance: https://firebase.google.com/docs/projects/api-keys

Public does not mean unrestricted. Keep application and API restrictions enabled,
enforce Authentication and Firestore rules, and review quotas and unexpected usage.
Referrer restrictions are not a substitute for owner authorization. Never use this
key for unrelated Google APIs or store privileged credentials in browser code.

## Review of GitHub secret-scanning alert #1 — November 5, 2026

Read-only checks against GitHub and the real Google project established:

- The only returned repository secret-scanning alert was open alert #1, type
  `google_api_key`, with validity `unknown`. Its value exactly matched the public
  Firebase browser configuration. GitHub located it in `firebase-config.js:4`,
  commit `6785f47790933a0d8ee6b0146695ecf8cba18de1`.
- The matching Google key is named **Browser key (auto created by Firebase)**.
  Its website restrictions contained exactly the Job Tracker `web.app` and
  `firebaseapp.com` origins and `https://payola-draft.onrender.com/`.
- API restrictions were present, but included 25 services, substantially broader
  than Payola's Auth/Firestore needs. Examples requiring review include
  `sqladmin.googleapis.com`, `logging.googleapis.com` and
  `firebasevertexai.googleapis.com`. Listing a service is not evidence of a
  permission grant or misuse. Do not remove shared restrictions without checking
  Job Tracker's dependencies and testing both apps.
- Deployed Firestore rules exactly matched the local `firestore.rules` (ignoring
  leading/trailing whitespace). Email/password authentication was enabled and the
  Payola origin was an authorized domain.
- GitHub secret scanning and push protection were enabled. They must stay enabled;
  do not hide this alert by broadly excluding Firebase files or key patterns.
- A targeted regex scan of 165 locally reachable Git-history blobs found the Google
  browser key only. It did not find the checked private-key, GitHub-token, AWS-key,
  Google OAuth-secret or service-account-private-key patterns. This is limited
  triage, not an exhaustive secret audit, and does not cover unreachable history,
  remote-only refs, ignored files, deployment settings or other repositories.
- Live `/api/accounts` returned `enabled: true` with Firebase configuration. This
  supersedes earlier disabled checks; it is not end-to-end account certification.

No key rotation/revocation, API restriction edits, rule deployment, alert closure,
history rewrite, or user-data mutation was performed during this review. The
alert remains open pending shared API-scope review. Historical usage, billing,
existing admin assignments and actual email-link completion were not audited.

## Resolution checklist

1. Inventory the APIs actually used by both applications. Prefer a separately
   restricted Payola browser key in the same Firebase project when independent
   lifecycle management is needed; separate keys do not isolate user data.
2. Review request metrics, Auth abuse and applicable quotas. Investigate unexpected
   usage before declaring that there is no incident. Budget alerts are not hard
   spending caps.
3. Test registration, reset/verification links, sign-in, token refresh and cloud
   operations on both apps before tightening or replacing a shared key.
4. If retaining intentional public configuration, resolve the alert with an honest
   documented reason such as `wont_fix`, explaining that this is public Firebase
   client configuration and describing the verified controls. Do not claim
   `revoked` or `used_in_tests`. Do not dismiss a real private credential this way.
5. If a private credential is found, revoke/rotate it first, update its consumers,
   review access, and then assess repository/history cleanup. Deleting a source
   line alone is not revocation.

GitHub guidance: https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-secret-scanning-alerts/resolving-alerts

## Reporting

Do not post credential values, personal listening data or user documents in public
issues. Use GitHub private vulnerability reporting if the repository offers it;
otherwise establish a private owner contact before transmitting sensitive details.
This document does not claim a private-reporting channel is configured.