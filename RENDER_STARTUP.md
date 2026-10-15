# Render startup diagnostics

Updated October 16, 2026. The previous generic error cannot identify the deployed failure. The new code logs fixed stage/category labels, never raw driver errors, stack traces, credentials or environment values. No deployment or private configuration change was performed.

## Environment and listener

Render supplies `process.env` directly. Production now skips loading local `.env` entirely; development still loads it without overriding existing process variables. No local file is needed on Render. The server validates settings, connects, initializes indexes, then binds `0.0.0.0` on the provider's `PORT`. The configured database is explicitly `librarysystem`, regardless of the URI's default database.

Check these in the Render service environment (not Git):

- `NODE_ENV=production`.
- `CLIENT_URL=https://library-system-eta-three.vercel.app` exactly, with no quotes, spaces, trailing slash or path.
- `MONGO_URI`: privately supplied valid Atlas URI, no placeholder brackets. Confirm the intended Atlas database user and correctly percent-encoded special characters in credentials. Do not post the URI in logs/issues.
- `JWT_SECRET`: existing private secret, at least 32 characters, no placeholder brackets.
- `TRUST_PROXY=0`, or `1` only for a verified single trusted proxy hop; values such as `true` are rejected.
- Let Render supply `PORT`; if explicitly set, it must be an integer from 1 through 65535.

Root `LibrarySystem` (or `.` if the repository starts inside that folder), build `npm ci --prefix server --omit=dev`, start `npm start --prefix server`, Node 22.x, health `/api/health`. Do not use a server-only root: sibling `shared` imports must remain available. See [Render web services](https://render.com/docs/web-services) and [environment variables](https://render.com/docs/environment-variables).

## Interpret the first failed stage

| Stage/category | Meaning and next step |
| --- | --- |
| environment / configuration-client_url | Missing/malformed origin, trailing slash/path, non-HTTPS production origin or localhost. Use the exact domain above. |
| environment / configuration-port or configuration-trust_proxy | Invalid numeric port or unsupported proxy setting. |
| jwt-configuration / configuration-jwt_secret | Missing, too-short or placeholder secret. Configure the existing private value in Render. |
| database-connect / configuration-mongo_uri or database-uri-format | Missing, placeholder or malformed URI/options. Check privately in Render. |
| database-connect / database-authentication | Atlas rejected database credentials/authentication configuration; check the Atlas database user, not the Atlas website login. |
| database-connect / dns-or-network, tls, database-network-or-selection | DNS/SRV, TLS, firewall/network access, unavailable/paused cluster or server selection timeout. A selection timeout alone does not prove an IP allowlist problem. Check the cluster and allow the Render service's actual outbound addresses in Atlas. |
| any index stage / database-permission | Database user lacks an operation required for collection/index initialization. Ask the owner to review intended permissions; code does not alter privileges. |
| user-indexes, book-indexes, borrowing-indexes / duplicate-data-index | Existing duplicates prevent a required unique index. Do not delete records automatically; arrange owner review. |
| index stage / index-definition-conflict | Existing index has incompatible options/name. Review definitions with the owner; do not drop indexes automatically. |
| http-listen / port-in-use or permission-denied | Port is occupied or binding denied. Check service process/start configuration and provider port. |
| express-setup or any stage / unexpected-error | Other application/module/driver failure. Share only the fixed stage/category for further investigation. |

Index initialization uses `Model.init()`, not destructive `syncIndexes()`: User email, Student ID and initial-Admin uniqueness; Book ISBN uniqueness; Borrowing active/pending pair uniqueness and query indexes. Failed builds can also result from unsupported partial-index options, connectivity loss or permissions. Startup never resets records. Mongoose may begin automatic index initialization as models load, so an index error can surface while connection/model initialization is resolving.

Missing dependencies/shared files, syntax errors or module-load errors before `start()` are outside this startup handler and produce separate Node errors. Process termination/resource exhaustion also cannot reliably be diagnosed by this handler. CORS rejection of an incoming request returns 403; it does not itself stop startup. Invalid production CORS configuration does stop startup.

Atlas allows connections only from approved network addresses. Check Render's outbound addresses against Atlas Network Access; no networking or database-user permissions were changed here. See [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/). Local success does not prove Render network access.

## Verification and Git handoff

- Backend: **90 passed, 0 failed**. Added category/redaction and missing-production-environment regression checks.
- Lint: passed.
- Read-only Atlas inventory/reference/index audit: passed.
- Local noninteractive production startup using privately inherited variables (no production `.env` load): passed. Health HTTP 200/database connected, protected profile 401, allowed exact HTTPS origin and denied localhost CORS. The probe used a safe example HTTPS origin rather than contacting Vercel. The process was stopped afterward.
- Secret-value source/build scan and tracked environment-file exclusion check passed in the unrestricted verification run. This does not certify full Git history. No existing records, credentials or `.env` were changed.

Commit and push these files to the branch Render watches: `server/server.js`, `server/config/startupDiagnostics.js`, `server/test/startup.test.js`, `RENDER_STARTUP.md`, `MILESTONES.md`. If earlier Milestone 5 files are still uncommitted, include the reviewed runtime config, shared files and package/lockfiles described in `FINAL_TESTING.md` as well. Inspect the diff and staged list privately; do not stage `.env` or unrelated work. No dependency change is required for this fix.

After your push and Render redeploy, find the first `[startup] ... status=failed category=...` line. The exact hosted cause remains unconfirmed until that line is available. Successful logs end in `http-listen status=ok` and `Library API listening`; verify `/api/health` on the actual backend domain.
