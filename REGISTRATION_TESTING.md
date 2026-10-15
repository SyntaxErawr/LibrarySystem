# Student registration review

Students can now register from Login. The public endpoint forces Student access, normalizes account fields, hashes the password, and returns a success message. The student logs in separately. Admin/Librarian account management, role restrictions, token expiry and logout revocation remain in place.

## Changed and created files

| Area | Files | Change |
| --- | --- | --- |
| Shared validation | **New:** `shared/validation.mjs` | Common email/password checks, required-field rules, program choices and year levels |
| Backend input | **New:** `server/utils/accountInput.js` | Shared validated/normalized account input for registration and staff management |
| User model | `server/models/User.js` | Year level, new-student required fields, unique partial School ID index and updated creation/reset password rules |
| Controllers | `server/controllers/authController.js`, `server/controllers/userController.js` | Public registration, valid-email login, staff student validation and preserved permissions |
| Routes and limiting | `server/routes/authRoutes.js`; **new:** `server/middleware/rateLimit.js` | Register route and independent login/registration limits |
| API errors | `server/server.js` | Field-specific duplicate/validation responses and safe database outage feedback |
| Admin setup | `server/scripts/bootstrap-admin.js`, `server/scripts/setup-admin.ps1` | Reuse new password rules while preserving hidden, one-time setup |
| Backend checks | `server/test/auth.test.js`; **new:** `server/scripts/verify-registration.js`; `server/package.json` | Expanded regression tests and explicit live Atlas verification command |
| Registration UI | **New:** `src/pages/Register.jsx`, `src/components/FormFields.jsx` | Accessible registration, live checklists, required fields and visibility controls |
| Login and routing | `src/pages/Login.jsx`, `src/App.jsx` | Registration link/route, success message, live email/required-password checks |
| Staff management | `src/pages/admin/ManageUsers.jsx` | Shared School ID, program, year level and password validation; also reused by existing Librarian StudentRecords |
| Student profile | `src/components/DashboardWelcome.jsx` | Own email, School ID, program and year displayed |
| API and appearance | `src/services/api.js`, `src/index.css` | Field errors, validation styling and responsive cream/green forms |
| Browser checks | **New:** `scripts/browser-smoke.mjs`; `package.json`, `eslint.config.js`, `.gitignore` | Native headless Chrome checks, script linting and ignored screenshot artifacts |
| Documentation | `AUTH_SETUP.md`, `MILESTONES.md`; **new:** `REGISTRATION_TESTING.md` | Current setup, policies, results and review checklist |

## Results

Verified October 16, 2026 (Asia/Manila):

| Check | Result |
| --- | --- |
| Backend tests | 47 passed, 0 failed; includes nested cases |
| Frontend/backend/shared lint | Passed |
| Frontend production build | Passed |
| Headless browser checks | Passed; zero runtime exceptions |
| Responsive layouts | Desktop, tablet and mobile passed without horizontal overflow |
| Live Atlas registration | Passed; stored details/timestamp and bcrypt hash verified |
| Live duplicate checks | Email and School ID both rejected with HTTP 409 and field errors |
| Live Student auth | Login/profile passed; management access denied; logout revoked token |
| Live test cleanup | Exact temporary account removed; existing records unchanged |

Browser checks use fixture API responses and do not test actual Atlas calls. The separate live backend check uses the real registration/auth endpoints and database. No real credentials, JWTs, hashes or connection strings were printed. Screenshots contain fixture data with masked passwords and are saved under ignored `test-results/`.

## Repeat automated checks

From `LibrarySystem/server`:

```powershell
npm test
```

From `LibrarySystem`:

```powershell
npm run lint
npm run build
npm run test:browser
```

Browser checks use installed Chrome and the built frontend. No browser library was added. If Chrome is installed elsewhere, set `CHROME_PATH` to its executable locally before running. Port 4173 must be free. The browser has a temporary profile and intercepted API requests, so existing browser sessions and real accounts are not used.

Optional live persistence check from `LibrarySystem/server`:

```powershell
npm run verify:registration
```

This command intentionally creates a uniquely marked test Student in the configured Atlas database, checks persistence and authentication, and deletes only that test account. It does not alter existing accounts. Its output is limited to safe pass/failure summaries.

## Manual browser review

1. Run the backend (`npm run dev` in `server`) and frontend (`npm run dev` in `LibrarySystem`). Open the frontend address, normally `http://localhost:5173`.
2. Select **Create Student Account**. Blur empty inputs, type an invalid email, then correct it. Check neutral/red/green feedback and the disabled Create Account button.
3. Fill School ID/name, choose a program and year. Select **Other** to check its required text field. No School ID pattern is imposed.
4. Type a password with missing rules, then meet all seven requirements. Confirm that whitespace is not silently removed. Try a mismatched confirmation and both Show/Hide controls. Use only private credentials you choose; do not paste them into chat.
5. Submit a valid form. Confirm return to Login with a success message and no automatic sign-in. Log in to confirm the Student dashboard and own profile fields.
6. Try registering an already-used email or School ID; confirm specific feedback. An additional account is not created by these rejected attempts.
7. Check Admin and Librarian login with existing credentials. In account management, confirm new Student fields and validation, editing and deactivation. Librarians should see students only; Students cannot access management routes.
8. Refresh a dashboard, log out, then revisit it. Confirm session restoration and subsequent login redirection. Stop the backend temporarily to review the helpful network error, then restart it.
9. Check desktop/tablet/mobile widths. Review the retained cream, sand, forest-green and deep-green appearance.

The live automated test account has already been removed. Accounts you manually create are real library accounts; use your normal staff tools to deactivate test accounts when appropriate.

## Limits and compatibility

- There is no birthday field, email verification, password-recovery service or self-service staff registration in this scope.
- Student IDs are trimmed and case-sensitive. Emails are trimmed/lowercased and unique across all roles.
- Programs/year choices are configured in `shared/validation.mjs`. Stored `course` is the selected program code or the entered Other text; confirmation is never persisted.
- New student accounts require the new fields. Existing records are preserved; no forced password reset or bulk migration is performed. Staff should complete missing new details when editing older student information. Existing passwords are not checked against new complexity rules at login.
- New/changed passwords require 8+ characters, uppercase/lowercase, a number, a special character and non-whitespace content. Bcrypt's 72 UTF-8 byte maximum is enforced separately. Passwords are not trimmed.
- Unique indexes protect concurrent duplicate registrations. Existing duplicate School IDs would need deliberate owner review before index creation; the live preflight found none, and the actual unique constraint was verified through duplicate API requests.
- Rate limits are per IP and per process: 20 login attempts and 40 registration attempts per 15 minutes. They reset on restart. Registration does not prove school enrollment; authorized staff can deactivate an account.
- Manual checks above remain useful for owner review with actual chosen credentials. Automated UI uses test fixtures; real persisted registration/auth was checked separately.
- `server/.env` was untouched. No extra packages, lucide-react, Book Management work or deployment were introduced. Work stops here for review.
