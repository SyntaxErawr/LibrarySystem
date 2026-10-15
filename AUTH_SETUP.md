# Authentication and account setup

## First Admin (one time)

In a local PowerShell terminal:

```powershell
cd LibrarySystem/server
npm run setup:admin
```

Enter your chosen name, email and password when prompted. Password entry and confirmation are hidden; credentials are passed to Node through standard input, never command arguments, source code or environment files. New passwords must have at least 8 characters, uppercase and lowercase letters, a number and a special character, with a maximum of 72 UTF-8 bytes. There is no default account. Public registration creates Student accounts only; initial Admin setup remains local and one-time.

Setup connects to your existing Atlas database and creates one Admin in `users` with a bcrypt password hash. It refuses to change an existing Admin. A unique partial database index on the Admin role prevents concurrent setup from creating a second Admin. Do not remove that account or index to rerun setup.

This setup command is intentionally not run by Codex: you choose and enter the private credentials yourself. No real user accounts were created as part of automated testing.

## Run locally

In `LibrarySystem/server`, run `npm run dev` (or `npm start`). In a second terminal, in `LibrarySystem`, run `npm run dev` and open the displayed frontend address, normally `http://localhost:5173`.

Keep backend `.env` unchanged except when you intentionally update your local settings. `JWT_SECRET` must be a random secret of at least 32 characters. Restart Express after environment changes. The frontend defaults to `http://localhost:5000/api`; set `VITE_API_URL` in a local `.env.local` if the API origin differs. Keep `CLIENT_URL` equal to the frontend origin.

React Router and Tailwind are now declared in this project's own package files. Fresh checkouts can run `npm ci` here and `npm ci` in `server` without relying on parent-folder dependencies. See [FINAL_TESTING.md](FINAL_TESTING.md) for current installation and hosting instructions.

## Accounts and permissions

Students can select **Create Student Account** from Login, or open `/register`, and enter School ID, full name, email, program, year level, password and confirmation. After success, they return to Login with a confirmation message; registration does not log them in automatically. Emails are trimmed and lowercased, School IDs are trimmed and unique among students, and passwords are preserved exactly before hashing. Birthday is not collected. The **Other** program option requires text. Edit `shared/validation.mjs` to change the program list in both React and Express.

All new or changed passwords follow the complexity rules above. Login requires only a valid email and nonempty password, so existing Admin, Librarian and Student passwords remain usable without being changed. The bcrypt byte limit also applies at the API boundary. Older student records without new fields remain intact; complete the new required student details when editing their information.

| Action | Admin | Librarian | Student |
| --- | --- | --- | --- |
| Sign in/out and view own profile | Yes | Yes | Yes |
| Create/edit/deactivate students | Yes | Yes | No |
| Create/edit/deactivate librarians | Yes | No | No |
| Create another Admin or change account roles | No | No | No |

After sign-in, each user goes to `/admin`, `/librarian` or `/student`. Staff see **Manage accounts** or **Student accounts**. Use **Edit**, clear **Account active**, then **Save changes** to deactivate an account. Reactivating an account allows a fresh login. To reset a managed account's password, enter a new password in the edit form. Blank passwords during editing keep the current hash.

Roles are fixed after creation. Admin accounts are not editable through account-management APIs. Deactivation, password reset and logout revoke previous tokens. Logout signs out all sessions for that account. Tokens expire after two hours and are kept in browser session storage for the current tab; refresh verifies the token with the backend. A network failure during logout displays an error so you can retry server revocation. Browser close clears local session storage but is not a server-side logout.

API endpoints:

- `POST /api/auth/login`: email/password; returns a two-hour JWT and safe user profile.
- `POST /api/auth/register`: public Student-only registration; requires `studentId`, `name`, `email`, `course`, `yearLevel`, `password` and `confirmPassword`. Use `course: "Other"` plus `otherProgram` for an unlisted program. Returns a success message without a token or password data.
- `GET /api/auth/me`: requires `Authorization: Bearer <token>`.
- `POST /api/auth/logout`: requires a token; revokes existing account sessions.
- `GET /api/users`: Admin sees managed staff/students, Librarian sees only students (up to 500).
- `POST /api/users`: creates an allowed role with validated name, email and password.
- `PUT /api/users/:id`: updates allowed accounts; supports password reset and `isActive`.

The backend checks current database role and activity on every protected request. Password hashes and token versions are excluded from API responses. Login has a per-IP limit of 20 requests per 15 minutes; public registration has a separate limit of 40 requests per 15 minutes. These simple limits are in memory for the current single-process local backend; restarting clears them. Multi-instance hosting would need a shared limiter in a later deployment milestone.

## Verification

```powershell
# In LibrarySystem/server
npm test
# In LibrarySystem
npm run lint
$env:VITE_API_URL = 'http://localhost:5000/api'
npm run build
```

Backend tests use real HTTP, Mongoose validation/save hooks, bcrypt and JWT, with an in-memory replacement for persistence. They do not insert, change or delete Atlas records. Live smoke checks verify Atlas startup, user indexes, connected health and unauthorized endpoint rejection.

After your initial setup, manually check the browser:

1. Log in as Admin, confirm the Admin dashboard, and create one Librarian and one Student with passwords you choose privately.
2. Log out. Try a wrong password, then log in correctly as Librarian. Confirm only student accounts are visible and editable.
3. Log in as Student. Confirm the student dashboard; visit `/admin/users` directly and confirm redirection to `/student`.
4. Refresh each role's page to confirm session restoration. Log out and revisit the dashboard URL to confirm redirection to login.
5. Deactivate the Student as staff and confirm that student login fails. Reactivate for a fresh login.

Dependency-free headless Chrome checks are now available: build the frontend, then run `npm run test:browser`. They use intercepted API fixtures and do not access Atlas. A separate opt-in live check is `npm run verify:registration` in `server`; it creates one temporary Student, verifies persistence/login/duplicate rejection/logout, then deletes only that exact test account. Both were run successfully. See [REGISTRATION_TESTING.md](REGISTRATION_TESTING.md) for the registration review checklist, changed files and current results. Book inventory, catalog and dashboard inventory totals are now implemented; see [BOOK_MANAGEMENT.md](BOOK_MANAGEMENT.md). Borrowing, returns, Student My Books and loan dashboards are also implemented; see [BORROWING_TESTING.md](BORROWING_TESTING.md) for the current demonstration checklist. Nothing has been deployed.
