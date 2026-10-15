# Final testing and deployment preparation

Verified October 16, 2026 (Asia/Manila). Milestone 5 is complete for local review. Nothing was deployed. Existing environment files, real passwords and library records were not changed. Historical test counts in earlier documents are superseded by these results.

## Application and permissions

React/Vite/Tailwind frontend, Express/Mongoose backend, Atlas persistence, bcryptjs passwords and JWT authentication. Completed modules: Student registration/live validation, login/logout, account management, searchable inventory and archive, borrowing requests and review, issuing/returns, personal history and role dashboards. Overdue calculations use Asia/Manila dates. Pending requests do not reserve stock; pending plus active loans are limited to three per Student.

| Capability | Admin | Librarian | Student |
| --- | --- | --- | --- |
| Login/logout and own profile | Yes | Yes | Yes |
| Manage Librarian accounts | Yes | No | No |
| Manage Student accounts | Yes | Yes | No |
| Inventory create/edit/archive | Yes | Yes | No |
| Issue, return, approve/reject requests | Yes | Yes | No |
| Browse active catalog | Yes | Yes | Yes |
| Own requests, cancellation and history | Staff views | Staff views | Yes |

Roles are fixed after creation. Management APIs cannot create/edit Admin accounts. Public registration creates only Students. Existing one-time Admin setup remains private and local; never run it as a hosting startup command. Every protected API checks current database role, activity and token version.

## Problems fixed and changed files

- Declared Router/Tailwind locally instead of relying on parent dependencies; refreshed both lockfiles and added Node engine/version settings. Files: both `package.json` and `package-lock.json` pairs, `.node-version`.
- Required explicit valid production API URLs, preserved local development defaults, added SPA rewrites and real page metadata. Files: `vite.config.js`, `src/services/api.js`, `vercel.json`, `index.html`, frontend `.env.example`.
- Added production origin/port/proxy validation, all-interface binding, startup error cleanup, bounded graceful shutdown and security headers. Files: `server/config/runtime.js`, `server/server.js`, `server/.env.example`.
- Fixed concurrent password-reset/logout revocation: token versions increment atomically rather than overwriting a newer revocation. File: `server/controllers/userController.js`.
- Fixed optional password accessibility descriptions and textarea focus/error styling. Files: `src/components/FormFields.jsx`, `src/index.css`. Preserved cream/sand/green design; no lucide-react.
- Added runtime/CORS/atomic-update checks and sidebar/modal keyboard checks. Files: `server/test/runtime.test.js`, `server/test/foundation.test.js`, `server/test/auth.test.js`, `scripts/browser-smoke.mjs`, `eslint.config.js`.
- Added isolated installation and read-only readiness verification: `scripts/verify-clean-install.mjs`, `server/scripts/verify-readiness.js`.
- Updated `README.md`, `AUTH_SETUP.md`, `MILESTONES.md` and this document.

Source/navigation review found no unfinished core module or broken role link. Empty `src/App.css` and unused stock public icons remain harmless. No major refactoring was needed.

## Test results

| Check | Result |
| --- | --- |
| Backend full suite | **88 passed, 0 failed**: auth, registration, permissions, inventory, circulation, requests, runtime configuration and CORS. Uses replacement persistence, not real Atlas records. |
| `npm run lint` | Passed. |
| Production frontend build | Passed with explicit API URL. |
| `npm run verify:clean-install` | Passed isolated frontend `npm ci` and hosted-URL build, backend production-only `npm ci` and backend/shared module load. Compiled hosted JS has the configured HTTPS API and no localhost fallback. Existing dependency folders/private env files were not copied or changed. |
| `npm run test:browser` | Passed Chrome interaction regressions with intercepted fixtures: validation, all-role redirects, session restore, management restrictions, inventory, requests/loans, dashboards, mobile views, active sidebar and modal keyboard focus. Zero runtime exceptions. |
| `verify:registration` | Passed live Atlas persistence, bcrypt, duplicate prevention, login, permissions and logout revocation. |
| `verify:books` | Passed live Atlas ISBN uniqueness, search, stock transactions, archive guards, statistics and history. |
| `verify:borrowings` | Passed live Atlas concurrent limits/last-copy/returns, rollback, dates, staff attribution, history and Student privacy. |
| `verify:requests` | Passed live Atlas JWT ownership, unchanged pending stock, competing approvals, combined limits, rejection/cancellation, catalog/history and rollback. |
| `verify:readiness` | Passed read-only inventory bounds, active-loan/stock agreement, active-loan references and required unique indexes. Noninteractive production-mode startup of the exact `npm start` target (`node server.js`) passed: connected health HTTP 200, unauthenticated profile 401, intended HTTPS CORS allowed and localhost denied. |

Live workflow scripts removed only their exact disposable users/books/borrowings; real accounts and records were preserved. Normal startup does not seed/reset data or drop collections. Browser fixtures verify UI behavior separately from live Atlas transaction tests.

The secret scan found no occurrences of the actual current MongoDB URI or JWT secret in scanned source/build files. Environment ignore patterns passed. **No Git repository exists here**, so tracked files and committed history could not be checked. Review staged files/history privately before publishing; this scoped check is not a complete security or dependency vulnerability audit.

## Local startup

Use Node 22 LTS, 22.12 or newer (package engines also permit Node 24). From `LibrarySystem`:

```powershell
npm ci
npm ci --prefix server
npm run dev --prefix server
```

In a second terminal here, run `npm run dev`. Keep existing `server/.env` private and unchanged. New machines should use example files as references and supply secrets privately. Development defaults to frontend `http://localhost:5173` and API `http://localhost:5000/api`.

```powershell
# From LibrarySystem
npm test --prefix server -- --test-reporter=spec
npm run lint
$env:VITE_API_URL = 'http://localhost:5000/api'
npm run build
npm run test:browser
npm run verify:clean-install
```

Production builds require an explicit API URL; a local `.env.local` may contain only that public frontend setting. For manual `npm run preview`, set backend `CLIENT_URL` to the displayed preview origin (normally `http://localhost:4173`) and restart Express. Chrome browser checks require an installed supported executable; see `CHROME_PATH` in the script.

Optional live commands in `server`: `npm run verify:registration`, `npm run verify:books`, `npm run verify:borrowings`, `npm run verify:requests`, `npm run verify:readiness`. Run sequentially. The first four use disposable fixtures; readiness is read-only. Unexpected machine termination can interrupt cleanup; inspect exact fixture IDs rather than deleting by broad patterns.

## Future Vercel settings

| Setting | Value |
| --- | --- |
| Root directory | `LibrarySystem` |
| Preset / Node | Vite / 22.x |
| Install / build | `npm ci` / `npm run build` |
| Output | `dist` |
| Public environment variable | `VITE_API_URL=https://YOUR-BACKEND-HOST/api` |

If the future Git repository starts directly inside the app, use root `.` instead. Set the real HTTPS API URL before building; variable changes require rebuilding. `vercel.json` routes SPA deep links to `index.html`, following [Vercel's Vite guidance](https://vercel.com/docs/frameworks/frontend/vite). Actual hosted deep-link behavior remains to be checked after separately approved deployment. Never put MongoDB credentials or JWT secrets in frontend variables.

## Future Render settings

| Setting | Value |
| --- | --- |
| Service / Node | Node web service / 22.x |
| Root directory | `LibrarySystem`, or `.` if Git starts inside the app |
| Build | `npm ci --prefix server --omit=dev` |
| Start | `npm start --prefix server` |
| Health path | `/api/health` |

**Correction to the proposed server-only root:** backend imports need the sibling `shared` directory. Render excludes files outside its configured root, so root `LibrarySystem/server` would fail. Keep the whole app root available and run commands with `--prefix server`. See [Render monorepo support](https://render.com/docs/monorepo-support). Express uses provider `PORT` and binds `0.0.0.0`, as required by [Render web services](https://render.com/docs/web-services).

Private backend service variables:

- `NODE_ENV=production`.
- `MONGO_URI`: existing intended Atlas connection/database, supplied privately.
- `JWT_SECRET`: preserve the existing strong private secret, at least 32 characters.
- `CLIENT_URL`: exact stable HTTPS frontend origin, no trailing slash/path or wildcard. Arbitrary preview origins are denied.
- `TRUST_PROXY=0` by default; use `1` only after verifying exactly one trusted reverse-proxy hop. Incorrect trust affects IP rate limiting.
- `PORT`: supplied by the provider; no fixed public port needed.

Do not enable automatic deployment or run Admin setup/reset/seed commands at startup before review and approval.

## Atlas requirements

Existing Atlas connection, transactions, unique indexes and read-only inventory consistency checks passed. Preserve the intended database, existing accounts, books, borrowing history and indexes. The owner must confirm that the eventual host's outbound network is allowed by Atlas and its database permissions are appropriate. No hosting network exists to test yet; no Atlas network or privilege changes were made. Do not automatically allow all IP addresses. Backup policy remains an owner decision; no backup/restore operation was performed.

## Manual review checklist

1. Privately log in with each role, check role redirects, refresh/session restoration, wrong-password messages and logout. Use designated test accounts for inactivity/password-change checks.
2. Register a test Student; check live email/password/confirmation and duplicate ID/email errors. Confirm Admin manages Librarians/Students and Librarian only manages Students.
3. Use a test book to check ISBN/quantity validation, search/category/availability, edit and archive confirmation. Verify archived titles are hidden from Students and history retained.
4. Request/cancel as Student; reject with a reason or approve after physical handover as staff. Verify unchanged pending stock, one-copy issue/return, duplicate guards and the combined limit.
5. Check Student privacy/history, Manila overdue dates and dashboard totals. Review mobile/tablet widths, keyboard navigation, dialog close/focus return, readable errors and contrast. Automated checks do not constitute full accessibility certification.
6. Before deployment approval, review Git staged files/history privately and configure real host URLs, environment, proxy and Atlas access. After separately approved deployment, repeat connected health, CORS, deep-link refresh and all-role smoke checks on actual domains.

## Remaining limitations and readiness

Ready for local review and deployment configuration; **not deployed or hosted-verified**. Owner steps remain: repository/history review, actual hosting settings/network/proxy decisions and manual demonstration.

Rate limits are in-memory per process and reset on restart; use a single backend instance or add a shared limiter before scaling. Public registration does not verify email ownership. JWTs last two hours in session storage; logout revokes all account sessions. Existing finite staff list limits suit this college project rather than unlimited reporting. No additional business module was introduced.
