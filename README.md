# School Library

React/Vite frontend and Express/Mongoose backend for Admin, Librarian and Student accounts, inventory, borrowing requests, issuing, returns and history.

Use Node 22 LTS (22.12 or newer). From this directory:

```powershell
npm ci
npm ci --prefix server
npm run dev --prefix server
```

In another terminal here, run `npm run dev`. Keep the existing private `server/.env`; new installations should use the example files as references and supply settings privately. Never put database credentials or JWT secrets in frontend variables.

For a local production build:

```powershell
$env:VITE_API_URL = 'http://localhost:5000/api'
npm run build
```

For `npm run preview`, backend `CLIENT_URL` must match its displayed frontend origin (normally port 4173). Development normally uses port 5173.

See [FINAL_TESTING.md](FINAL_TESTING.md) for current test results, limitations, manual checks and exact future Vercel/Render settings. See [AUTH_SETUP.md](AUTH_SETUP.md) for private initial Admin setup and permissions, and [MILESTONES.md](MILESTONES.md) for progress. Nothing has been deployed.
