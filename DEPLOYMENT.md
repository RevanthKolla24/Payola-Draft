# Payola Draft private-beta deployment

Deploy the existing Node server as a **Web Service**, not a static site: the optional Last.fm proxy and integration configuration endpoints need server execution. No database is required. Nothing in this repository automatically purchases hosting, creates a service or publishes the app.

## 1. Verify and push

From the repository directory:

```sh
npm test
npm run check
git status
```

Review the diff and ensure no listening exports, usernames or credentials are being committed. Commit the intended application/configuration files and push your branch. The GitHub Actions workflow runs unit/server tests and syntax checks on pushes and pull requests. It does not run the optional browser suite or deploy anything.

The deployment/CI runtime is pinned in `.node-version` to Node 24.22.1. Local validation may use a different runtime; verify the pinned runtime in CI before launching, and keep this pin updated for security releases.

## 2. Create a Render Web Service

Connect the GitHub repository in Render and select:

| Setting | Value |
| --- | --- |
| Language | Node |
| Branch | main, or your reviewed deployment branch |
| Root directory | Repository root |
| Build command | `npm test && npm run check` |
| Start command | `npm start` |
| Health check path | `/healthz` |

There are no runtime dependencies or generated assets to install/build. Revisit the build command if dependencies are added. Render supports `.node-version`; remove a conflicting `NODE_VERSION` dashboard override or keep it aligned. Disable automatic deploys during initial verification if you want a manual release gate. Choose hosting resources and review current billing yourself before creating the service.

Set these environment variables in the hosting dashboard:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | Use the hosting platform's assigned value; do not copy the local `.env` value |
| `LASTFM_API_KEY` | Optional owner-provided key; omit to disable Last.fm |
| `ENABLE_APPLE_PREVIEW` | `false` for the initial beta |
| `APPLE_MUSIC_DEVELOPER_TOKEN` | Omit unless deliberately enabling/testing Apple |

Production defaults to `0.0.0.0`; local development defaults to `127.0.0.1`. `PORT` is validated. Never upload your local `.env` wholesale. `.gitignore` excludes environment files and common private-key formats, but cannot remove secrets already tracked by Git. The app's static allowlist does not expose these files.

## 3. Check the generated HTTPS address

At your deployed origin:

- `GET /healthz` must return HTTP 200 and `{"status":"ok"}`. This is process liveness, not an upstream Last.fm/Apple health check.
- `GET /api/integrations` returns only `lastfm` and `apple` booleans, never keys. Configured does **not** mean live-verified; Last.fm only checks key presence, and Apple checks enabled state plus token structure/expiration, not its signature.
- Load the sample, enter manual counts and import a synthetic Spotify JSON/ZIP. Confirm date filters and PNG/CSV downloads.
- Verify the dashboard disables Last.fm when unconfigured and does not offer Apple preview when disabled/unconfigured.
- Verify missing config status does not prevent manual or file workflows.

An Apple token is intentionally sent to the browser SDK through its separate config endpoint when enabled; it is not the private signing key. Never commit or deploy Apple's private signing key. The direct preview page remains readable when disabled, but cannot prepare a connection or fetch the SDK through the app flow.

## 4. Integration and proxy launch gates

- Supply a real Last.fm key, review the platform's attribution/usage terms, and test a small public history, pagination, errors and cancellation on the deployed HTTPS origin.
- Keep Apple disabled until real MusicKit authorization, token refresh/expiration, CSP, disconnect and supported-browser behavior have been checked. To test it intentionally, set `ENABLE_APPLE_PREVIEW=true` and a valid `APPLE_MUSIC_DEVELOPER_TOKEN`.
- Current limits are process-local: four concurrent Last.fm upstream requests, 120 requests/minute globally, 100/minute per direct socket IP. Forwarded IP headers are deliberately ignored. A reverse proxy may cause visitors to share one socket-IP quota. This is conservative protection, **not** reliable per-user limiting behind every host.
- Review the host's actual proxy topology and edge abuse protections before a broad launch. Do not simply trust arbitrary `X-Forwarded-For`. Multiple app instances have independent quotas; shared/distributed limiting is not implemented.
- Keep hosting/access logs from retaining sensitive query URLs where possible. Last.fm requests include usernames and dates. The application does not log requests or upstream exceptions, but hosting infrastructure may. Upstream proxy errors are replaced with bounded public messages.
- Use HTTPS. Verify host/proxy origin behavior; do not weaken same-origin checks to work around an unreviewed proxy configuration.

## 5. Private beta and rollback

The generated hosting URL is public unless you configure access protection; calling it a private beta does not make it private. Use host-level access controls if invitation-only access is required. Do not add a shared password to client-side JavaScript.

Before inviting testers:

- Verify privacy/methodology wording against real hosting logs and enabled integrations.
- Test mobile imports and downloads, keyboard navigation, Safari and Firefox in addition to the Chromium suite.
- Confirm no imported file contents leave the device; API fixtures are not proof of live integration behavior.
- Set up health monitoring and decide how testers should send feedback without sharing raw listening histories.
- Keep a known-good commit/deployment available. Roll back through the host or redeploy the prior reviewed commit if checks fail. Clear/disable integration variables if necessary, then restart/redeploy.

Only after this review, attach a custom domain, verify HTTPS and invite a small test group. Do not claim actual artist earnings, full listening-history synchronization, or verified service attribution.

## Local production-mode smoke test

```sh
NODE_ENV=production HOST=127.0.0.1 PORT=3001 npm start
```

Visit the local origin on port 3001 and check `/healthz`. Binding explicitly to localhost here prevents exposing your smoke-test server to the network. For optional browser checks, use the documented `PLAYWRIGHT_MODULE` and set `TEST_URL` to this origin.

For local environment files, copy `.env.example` to `.env` and run `node --env-file=.env server.js`. `npm start` does not load `.env` automatically. Never commit real keys or private listening data.

## Official references

- Render Web Services: https://render.com/docs/web-services
- Render Node deployment: https://render.com/docs/deploy-node-express-app
- Render health checks: https://render.com/docs/health-checks
- Render Node version configuration: https://render.com/docs/node-version
- Node 24.22.1 security release: https://nodejs.org/en/blog/release/v24.22.1
- GitHub Node CI guidance: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
