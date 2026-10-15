# Book Management — Milestone 3

Admin and Librarian now share **Book Inventory** at `/admin/books` and `/librarian/books`. Students have **Book Catalog** at `/student/books`. Sidebar links are available after login. Account management and registration continue to work.

## Files created or modified

| Files | Purpose |
| --- | --- |
| `server/models/Book.js` | Previously empty; validated schema, unique ISBN, catalog index, status and optimistic concurrency |
| `server/controllers/bookController.js` | Previously empty; secured CRUD/archive logic, stock transactions, search, filters, pagination and stats |
| `server/routes/bookRoutes.js` | Previously empty; authenticated reads and Admin/Librarian-only writes/stats |
| `server/server.js` | Mount books API, initialize indexes, no-store responses and safe duplicate/version errors |
| **New:** `shared/bookValidation.mjs` | Common React/Express ISBN, text, quantity, year and URL validation |
| **New:** `src/components/BookBrowser.jsx` | Reused staff inventory/Student catalog, filters, details and archive confirmation |
| **New:** `src/components/BookForm.jsx` | Add/edit dialog with accessible validation and server errors |
| **New:** `src/components/InventoryStats.jsx` | API-based dashboard totals and refresh behavior |
| `src/pages/admin/ManageBooks.jsx`, `src/pages/student/BookCatalog.jsx` | Implement existing page files using shared browser |
| `src/pages/admin/AdminDashboard.jsx`, `src/pages/librarian/LibrarianDashboard.jsx` | Add real inventory statistics |
| `src/App.jsx`, `src/components/SideBar.jsx`, `src/index.css` | Protected routes, role navigation, dialogs, responsive table/cards and retained theme |
| **New:** `server/test/books.test.js` | Book permissions, validation, queries, stock and history safeguards |
| **New:** `server/scripts/verify-books.js`; `server/package.json` | Opt-in isolated Atlas verification and cleanup command |
| `scripts/browser-smoke.mjs` | Extend existing browser regression checks with book flows and fixture APIs |
| `MILESTONES.md`, `AUTH_SETUP.md`, **new:** `BOOK_MANAGEMENT.md` | Results, setup, changed files, review checklist and next-milestone contract |

No packages were installed. Existing models/controllers/routes/pages, authentication middleware, API helper and layouts were reused. `server/.env` was not changed.

## API and inventory rules

All endpoints require a valid existing JWT:

| Endpoint | Access / behavior |
| --- | --- |
| `GET /api/books` | All roles; list/search/filter active books; Students always restricted to active records |
| `GET /api/books/:id` | All roles; archived details are hidden from Students |
| `GET /api/books/stats` | Admin/Librarian; aggregate active inventory only |
| `POST /api/books` | Admin/Librarian; initializes available copies to total copies |
| `PUT /api/books/:id` | Admin/Librarian; full editable book fields plus `version` from the latest book's `__v` |
| `DELETE /api/books/:id` | Admin/Librarian; archive after outstanding-loan checks, preserving records/history |

List query parameters: `search`, `category`, `availability=available|unavailable`, `state=active|archived`, `page` and `limit`. Default page size is 20; maximum is 100. Staff can view archived titles; Students cannot override the active-only scope. Categories are returned independently of current search/availability filters. Text search uses escaped literal matching, not user-supplied regular expressions.

`totalCopies` is the quantity field. Creation requires a positive integer; editing permits zero if no copies are borrowed. Quantities are capped at 1,000,000. Availability is derived on the server; requests that attempt to set `availableCopies` or `isActive` directly are rejected. Books with available copies display **Available**, otherwise **Unavailable**.

ISBNs must pass ISBN-10 or ISBN-13 checksum validation. Spaces/hyphens are removed and X is uppercased before storage and uniqueness checks. The catalog retains the entered ISBN format's length; equivalent ISBN-10/ISBN-13 aliases are not merged automatically. Archived ISBNs remain reserved.

Optional publication year must be a whole year from 1 through next year. Cover URLs accept HTTP/HTTPS without embedded credentials; no upload service is added. Failed cover images are hidden. Optional fields can be cleared during editing. Required strings are trimmed and length-limited; React renders them as text rather than HTML.

## Stock and archiving

Edits and archives use MongoDB transactions. Edits verify the submitted version and compare `totalCopies - availableCopies` with actual active borrowing records. They reject inconsistencies instead of silently altering loan records. Total quantity cannot fall below active loans, and available copies are recalculated as new total minus actual loans. Stale edits return HTTP 409; close the editor and refresh/reopen the book before trying again.

Archiving blocks active loans or outstanding copies. It marks the book inactive; neither the Book nor borrowing history is physically deleted. Archived titles are visible to staff through the Catalog filter. Restore/unarchive is outside this milestone.

Dashboard totals count active titles and physical/available copies. Borrowed copies are the actual inventory difference. No random figures or fabricated transactions are used. Totals reload on mounting the dashboard, window focus and book-change events; there is no background polling or push service.

## Verification results

Verified October 16, 2026 (Asia/Manila):

- Backend: **62 passed, 0 failed** (including nested cases). This includes all original authentication/registration tests and book permission, validation, duplicate, search/filter, stock, archive/history and stats tests.
- Frontend/backend/shared lint and production build: **passed**.
- Headless Chrome: **passed**. Existing registration/auth checks remain; book add/edit/search, archive cancellation/confirmation, details, mobile cards, Student read-only UI and dashboard refresh passed with zero runtime exceptions.
- Atlas: **passed**. The live check persisted an isolated book, exercised the actual transaction path and unique index, seeded a test-only loan to verify stock/archive guards, and confirmed history survives archive. Only the uniquely marked test records were removed. Existing user/book/loan records were not modified.

Repeat from `LibrarySystem/server`:

```powershell
npm test
# Optional: creates and cleans up only isolated verification data in Atlas
npm run verify:books
```

Repeat from `LibrarySystem`:

```powershell
npm run lint
npm run build
npm run test:browser
```

Browser automation uses installed Chrome, the built frontend on port 4173, a temporary browser profile and intercepted API fixtures. It does not access real accounts. Screenshots are saved under ignored `test-results/`. The separate Atlas command uses temporary test users and an exact-ID book/loan fixture, then cleans them up. Output contains no credentials, hashes, tokens or connection strings.

## Manual browser review

1. Start Express in `server` and Vite in `LibrarySystem` with `npm run dev`. Log in with an existing Admin or Librarian account.
2. Open **Book Inventory**, select **Add Book**, and check blank fields, an invalid ISBN and invalid quantities. Save a valid title with a real ISBN; confirm total and available copies match. Optional fields may be left empty.
3. Search by title, author and ISBN, and change category/availability filters. Test an unmatched query and clear filters. Review details and optional fields.
4. Edit a title and its total copies. Confirm the success message and stock. To test stale editing, open the same title in two tabs, save one, then try saving the other; refresh/reopen after the conflict.
5. Choose **Archive**, cancel, and confirm the title remains. Repeat and confirm; it should leave the active list but remain in the staff archived view.
6. Open **Overview** and compare the four statistics with active inventory. Repeat with Librarian to check shared access.
7. Log in as Student and open **Book Catalog**. Check search, filters, details and available counts. No Add/Edit/Archive controls should appear. Archived titles should not be accessible.
8. Refresh the browser/restart Express and verify the saved inventory remains. Check mobile widths, where table rows become complete cards, and desktop widths, where the inventory remains a table.

Manual additions are real library records. Use the archive workflow for test titles; do not reset collections or delete history.

## Required for the next milestone

Borrowing/Return APIs and screens are intentionally not implemented yet. Their model should use the existing `borrowings` collection with `book` and `student` ObjectId references, borrowed/due timestamps, nullable `returnedAt`, and status. The book guard treats `returnedAt: null` with a status other than `returned` as active (including overdue).

Issue/return must change the borrowing record and this same Book document in **one transaction**, update available copies atomically, and increment Book `__v`. This serializes circulation with staff inventory edits/archives. Before issuing, require an active book/student and positive availability. Block duplicate returns and unauthorized access. Add an index supporting active-loan lookup by book/return state.

The stock checks currently read the existing raw collection without introducing a premature Borrowing schema or transaction endpoints. Atlas transaction support was verified. No deployment or work on the next module is authorized by this completion; stop here for review.
