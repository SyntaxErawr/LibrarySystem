# Borrowing and Return Management — Milestone 4

Admin and Librarian now share **Borrowing & Returns** at `/admin/borrowings` and `/librarian/borrowings`. Students have **My Books** at `/student/my-books`. All pages reuse the existing dashboard layout, API helper, authentication and cream/sand/green styling.

## Student Borrowing Requests — current enhancement

Completed and verified October 16, 2026 (Asia/Manila). Students can now choose **Request to Borrow** in Book Catalog, confirm submission, and review the request in **My Books → Pending Requests**. School ID and personal details are taken from the signed-in account; the public request payload contains only the book ID. Staff still physically issue and return copies.

The existing Borrowing collection is reused. A pending request becomes the same issued loan record on approval, keeping the original request date. No extra collection or duplicate stock-issuing logic was introduced.

| State | Meaning / available action |
| --- | --- |
| `pending` | Waiting for staff; Student may cancel, staff may approve/issue or reject |
| `rejected` | Staff declined it; reason and review date remain visible in history |
| `cancelled` | Student cancelled their own pending request; cancellation date is retained |
| `borrowed` | Staff confirmed physical handover; stock was decreased exactly once |
| `returned` | Staff processed the return; actual return date is retained |

Overdue remains a calculated display state for issued loans only. Pending/rejected/cancelled requests have no borrowed/due dates and never count as borrowed stock or overdue loans.

The limit is now **three combined pending requests and active loans per Student**, including overdue loans. Approval replaces its existing pending slot rather than requiring a fourth slot. Direct staff issuing also respects the combined limit; if the same Student/title already has a pending request, approve that row rather than creating a separate loan.

Pending requests **do not reserve or decrease stock**. More than one Student may request the last available copy. Staff approval rechecks Student activity, combined limit, duplicates, book activity and availability in the existing shared transaction path. If another issue used the last copy, approval fails safely and the request stays pending. Staff can reject it with a reason or the Student can cancel it. Pending requests for subsequently archived books remain visible and cancellable/rejectable, but cannot be issued.

### Added request APIs

| Endpoint | Permission / behavior |
| --- | --- |
| `POST /api/borrowings/requests` | Student only; `{ book }`, with Student identity forced from JWT |
| `GET /api/borrowings/my?status=pending` | Own pending requests; existing own-history endpoint also supports rejected/cancelled/history filters |
| `GET /api/borrowings/requests/status?books=id,id` | Student only; latest/current status for their own records for at most 100 displayed catalog books |
| `PATCH /api/borrowings/:id/cancel` | Student only; their own pending record |
| `PATCH /api/borrowings/:id/approve` | Admin/Librarian; optional `dueDate` as `YYYY-MM-DD`, default seven days after actual issuance today |
| `PATCH /api/borrowings/:id/reject` | Admin/Librarian; required trimmed `reason`, 1–300 characters |

`GET /api/borrowings?status=pending` is the staff pending list. Added status filters are `pending`, `rejected`, `cancelled`, `history` (returned/rejected/cancelled) and `open` (pending plus active loans). Existing active/borrowed/overdue/returned filters remain. Dashboard summaries now include `pendingCount` separately from actual active/overdue counts.

Student My Books has **Pending Requests**, **Currently Borrowed** and **Borrowing History** sections. Staff have a **Pending Requests** section alongside existing records and direct issue/return actions. Confirmation dialogs cover submission, cancellation and physical handover; rejection requires a reason. Catalog request buttons are disabled for unavailable titles, pending requests and existing active loans; server checks enforce the same rules. Cancelled/rejected/returned history does not prevent a later eligible request.

### Concurrency and preservation

The existing Student circulation write lock now protects the combined count for request creation, direct issue, approval, cancellation and rejection. Approval and direct issue share `issueCopy`, including Book version guards, stock consistency checks and transactional writes. Approval conditionally changes only `pending` rows; simultaneous approval/cancel/reject attempts cannot apply competing transitions. A separate unique partial pending-pair index was added without dropping the existing active-loan index. Stock guards explicitly exclude pending/terminal requests.

Existing loans and return history were not migrated or overwritten. Existing Asia/Manila issuance/due-day rules remain; approval always sets borrow date to today, not the request date or a supplied backdate. Staff can adjust the due date. No automatic expiry, physical reservation, Student self-issuing or self-returning is added.

### Enhancement file inventory

- Backend: `server/models/Borrowing.js`, `server/controllers/borrowingController.js`, `server/routes/borrowingRoutes.js`, `server/controllers/bookController.js`, `server/server.js`.
- Shared status/date rules: `shared/borrowingDates.mjs`.
- New UI components: `src/components/RequestActionDialog.jsx`, `src/components/RequestTable.jsx`.
- Updated UI: `src/pages/student/BookCatalog.jsx`, `src/components/BookBrowser.jsx`, `src/components/BorrowingBrowser.jsx`, `src/components/BorrowingTable.jsx`, `src/components/LoanSummary.jsx`, `src/index.css`. Existing MyBooks and staff page files continue to reuse BorrowingBrowser.
- Tests/scripts: `server/test/borrowings.test.js`, **new** `server/scripts/verify-requests.js`, `server/package.json`, `scripts/browser-smoke.mjs`.
- Documentation: `MILESTONES.md` and `BORROWING_TESTING.md`.

### Current verification results

- Full backend suite: **85 passed, 0 failed**, including original auth, registration, inventory and circulation checks plus JWT-owned requests, duplicate/eligibility guards, own-record privacy/cancel, Admin/Librarian approval, combined limits, rejection/cancellation history and failed-approval rollback.
- `npm run lint` and `npm run build`: **passed**.
- `npm run test:browser`: **passed**, including all previous flows and Student request confirmation/status/disabled duplicate button, cancellation, staff approval with adjusted due date, required rejection reason and Student history. Zero runtime exceptions; the history screenshot was visually reviewed.
- `npm run verify:requests`: **passed against Atlas**. Confirmed persisted request identity/date, unchanged pending stock, exactly one successful approval of two requests competing for the last copy, duplicate approval denial, correct returns, combined limits, reasons/history, catalog status, accurate counts and rollback of both stock/version and request state after a fixture-only failed approval.
- Exact temporary request/loan, Book and User fixtures were removed. Existing library records were untouched. No credentials, secrets or `.env` values were displayed; `.env` was not modified. No packages, lucide-react or deployment were added.

Repeat the new live test from `LibrarySystem/server` with `npm run verify:requests`. It intentionally creates and cleans up isolated test accounts/books/requests; it does not change real library records. The original `npm test`, lint/build and browser commands below remain valid. Earlier milestone test counts below are historical; **85 passing backend tests** is the current result.

### Manual request demonstration

1. Start the existing Express and Vite apps. Sign in as an active Student, open **Book Catalog**, choose an available title, and select **Request to Borrow**. Close the confirmation once to verify cancellation of the dialog makes no request; then submit it.
2. Confirm the success message and **Request pending** badge/disabled request button. Available copies must remain unchanged. The app should not ask for School ID or personal details again.
3. In **My Books → Pending Requests**, cancel your request and confirm its cancellation appears in **Borrowing History**. You cannot cancel another Student's request or an already issued loan.
4. Submit another request, then sign in as Admin or Librarian. Open **Borrowing & Returns → Pending Requests**. Review Student, School ID, book/ISBN, request date and status.
5. Select **Approve and Issue**, confirm physical handover, review the default seven-day due date or adjust it, then confirm. The same row becomes borrowed, the actual borrow date is today, and stock decreases by exactly one.
6. Sign in as Student again. Check **Currently Borrowed**, due dates and the catalog's disabled request button for that title. Staff return processing must still work exactly once.
7. Request a different title, then reject it as staff. A blank reason must disable submission; enter a short reason. Student history should show the rejection, reason and date. Stock must remain unchanged.
8. Test three combined pending/active records with isolated test Students. A fourth request or direct issue must fail until a request is cancelled/rejected or a loan returned.
9. For contention, let two test Students request the last copy. Approve one; the other approval must fail without altering the pending request. The repeatable Atlas verifier covers this concurrently rather than requiring real records to be manipulated.
10. Review staff/Student pending dashboard counts separately from borrowed stock totals. Refresh and check that all requests/history persist. Stop here for manual approval before further work.

## Completed functionality

- Staff can search existing active Students and available active books, select a Student/Book, review School ID/ISBN, and issue one copy. Borrow date defaults to today and due date to seven calendar days later; staff can adjust the due date. Changing the borrow date resets the suggested due date.
- The backend checks eligibility, stock, duplicate active Student/book pairs and a maximum of three active books per Student. Overdue books count toward this limit. The server chooses staff attribution and calculates all stock changes.
- Staff can search records by Student name, School ID, book title or ISBN and filter active, borrowed/not overdue, overdue, returned, or all history. Returned records remain available. Lists are paginated.
- Return requires a confirmation dialog. It records the real return timestamp and staff member and restores exactly one copy. Repeated returns fail. Returns remain possible after Student deactivation.
- Students see only their own active loans/history, due dates and days remaining/overdue. They have no issue/return controls or permission to use staff endpoints. Query parameters cannot override the server's Student scope.
- Staff dashboards retain real book statistics and add active/overdue loan counts and recent transactions. Student dashboards show personal active/overdue totals, upcoming due dates and recent history. Archived-book references remain visible in borrowing history.

## Files created or modified

| Files | Change |
| --- | --- |
| `server/models/Borrowing.js` | Implement existing empty model: references, dates, status, staff attribution, timestamps and active-loan indexes |
| `server/controllers/borrowingController.js` | Implement existing empty controller: issue/return transactions, scoped queries, search/filtering, eligible Student lookup and dashboard summaries |
| `server/routes/borrowingRoutes.js` | Implement existing empty routes with JWT protection and staff write/record access |
| `server/models/User.js` | Hidden circulation version used to serialize simultaneous operations for a Student; excluded from responses |
| `server/server.js` | Mount routes, initialize loan indexes, disable response caching and handle duplicate-pair/transaction errors safely |
| **New:** `shared/borrowingDates.mjs` | Shared Asia/Manila date parsing, seven-day defaults, overdue status, readable dates and calendar-day differences |
| **New:** `src/components/BorrowForm.jsx` | Searchable Student/book dropdowns, automatic School ID/ISBN, date defaults and issue errors |
| **New:** `src/components/BorrowingBrowser.jsx` | Shared staff/Student views, filters, pagination, notifications and return confirmation |
| **New:** `src/components/BorrowingTable.jsx` | Shared readable history table/mobile cards and status/timing display |
| **New:** `src/components/LoanSummary.jsx` | Actual loan totals, upcoming dates and recent transactions/history |
| `src/pages/librarian/BorrowReturn.jsx`, `src/pages/admin/BorrowingRecords.jsx`, `src/pages/student/MyBooks.jsx` | Implement existing pages using shared components |
| `src/pages/admin/AdminDashboard.jsx`, `src/pages/librarian/LibrarianDashboard.jsx`, `src/pages/student/StudentDashboard.jsx` | Integrate loan summaries |
| `src/App.jsx`, `src/components/SideBar.jsx`, `src/components/DashboardWelcome.jsx`, `src/index.css` | Protected role routes, navigation, current welcome text and status/mobile styling |
| **New:** `server/test/borrowings.test.js` | API permissions, limit, dates, privacy, stock, rollback and return regression tests |
| **New:** `server/scripts/verify-borrowings.js`; `server/package.json` | Explicit isolated Atlas verification, concurrency and rollback checks |
| `scripts/browser-smoke.mjs` | Extend existing fixture-based browser checks for circulation, Student history and dashboard summaries |
| `MILESTONES.md`, `AUTH_SETUP.md`, **new:** `BORROWING_TESTING.md` | Current results, setup and demonstration instructions |

No packages were added. No lucide-react, fines, payments, reservations, deployment or work on a subsequent milestone was introduced. `server/.env` was not changed.

## API

All endpoints require an existing Bearer JWT:

| Method / endpoint | Permission and response |
| --- | --- |
| `GET /api/borrowings` | Admin/Librarian: all records with basic search/status/page filtering |
| `GET /api/borrowings/my` | Own records only, enforced by authenticated user ID |
| `GET /api/borrowings/summary` | Staff-wide or Student-personal totals, five recent records and upcoming active due dates |
| `GET /api/borrowings/students?search=...` | Staff-only active Student lookup by name/School ID, maximum 50 matches |
| `POST /api/borrowings` | Staff-only issue: `student`, `book`, `borrowedAt`, `dueDate` |
| `PATCH /api/borrowings/:id/return` | Staff-only return; server chooses return timestamp and staff identity |

Issue dates are `YYYY-MM-DD` strings, not arbitrary timestamps. Borrow date cannot be in the future, due date cannot precede borrow date, and invalid calendar dates are rejected. Staff can backdate a genuine loan; this also supports demonstrating overdue behavior with isolated test accounts.

List parameters: `search` (up to 120 characters), `status` (`active`, `borrowed`, `overdue`, `returned`, or empty for all), `page`, and `limit` (default 20, maximum 100). `active` includes both borrowed and overdue; `borrowed` excludes overdue. A Student cannot use the staff-wide list or lookup endpoint. Student filters and summary queries always retain their authenticated Student ID.

Responses include `displayStatus` and `daysRemaining`. Persisted `status` supports pending/rejected/cancelled/borrowed/returned; overdue is computed for issued loans and never requires a manual status change. Selected populated fields are limited to names/School IDs and book information; password hashes, secrets and internal circulation versions are not exposed.

## Date policy

All due-day calculations use **Asia/Manila**, including when the browser/computer uses another timezone. Borrow dates are stored at the start of the selected Manila day; due dates at its end. Return timestamps use the actual current instant. Due today is not overdue; overdue begins on the following Manila calendar day. Days remaining/overdue are calendar-day differences.

New records use `dueDate`. Read paths also support older `dueAt` records without rewriting them. Missing legacy dates display as not recorded instead of inventing deadlines. Existing historical records are preserved. Dashboard summaries and borrowing lists refresh on navigation/focus and every minute; status is calculated again on each request.

## Transactions and concurrency

Each issue/return updates the Borrowing and Book in one Atlas transaction. There is no fallback that writes stock and loans separately if transactions fail.

The transaction writes the Student's hidden `circulationVersion` before enforcing the active-loan count. This serializes simultaneous issues across different titles for the same Student. Active pair uniqueness has a database index as another safeguard. Each stock write also checks the current Book version and increments `__v`, so circulation conflicts safely with inventory edits and archives. A consistency check verifies active loan count against total-minus-available copies before changing stock.

Returns use the same Student lock order, conditional active-loan updates and Book version guards. Failed transactions roll back; retryable database write conflicts are handled by the Mongo driver transaction helper. Repeated returns cannot increment availability twice. No borrowing/history deletion API exists.

The new active-pair index does not repair or remove existing duplicates. If manually inserted legacy duplicates prevent indexing, review those deliberately rather than resetting the collection. Existing records did not block the verified Atlas initialization.

## Verification results

Verified October 16, 2026 (Asia/Manila):

| Check | Result |
| --- | --- |
| Full backend suite | **78 passed, 0 failed**, including nested cases; auth, registration, books and borrowing regressions |
| Frontend/backend/shared lint | Passed |
| Production build | Passed |
| Headless Chrome | Passed; zero runtime exceptions; issue choices/dates, overdue labels, return cancel/confirm, preserved history, My Books, role protection and dashboard updates |
| Mobile views | Staff and Student loan screenshots reviewed; responsive cards have no page overflow |
| Atlas concurrent Student limit | One existing loan plus three simultaneous different-title issues allowed only two additional loans |
| Atlas last-copy contention | Two simultaneous issues for one available copy produced exactly one success and one rejection; availability reached zero |
| Atlas duplicate returns | Two simultaneous returns produced one success and one rejection; availability increased exactly once |
| Atlas rollback | Injected fixture-only loan-write failure after the stock write left both stock/version and loan count unchanged |
| Atlas persistence/privacy | Dates, staff attribution, return history, overdue search/summary and Student isolation verified |
| Cleanup | Only exact temporary test loans, books and users were removed; no real Student/inventory records were changed |

Backend unit/API tests use real HTTP/auth checks and in-memory persistence with a transaction fixture. Their simulated concurrency is not presented as proof of Mongo locking. The separate Atlas verifier exercises actual concurrent database transactions. Browser tests use intercepted fixture API responses; they do not log into or modify real accounts.

## Run checks

From `LibrarySystem/server`:

```powershell
npm test
# Optional, live Atlas test with exact-ID fixture cleanup:
npm run verify:borrowings
```

The live verifier creates a temporary Librarian, four temporary Students, six books and their loans. It tests concurrent issues/returns and injects one failure for its own fixture only. Cleanup requires matching the newly created Book/Student/staff IDs and random identifiers. It prints only safe verification summaries, not credentials or real Student data.

From `LibrarySystem`:

```powershell
npm run lint
npm run build
npm run test:browser
```

Browser automation uses installed Chrome, the built frontend on port 4173 and a temporary profile. Screenshots are written to ignored `test-results/`.

## Manual professor demonstration

1. Start Express with `npm run dev` in `server`, and Vite with `npm run dev` in `LibrarySystem`. Log in with your chosen Admin or Librarian credentials.
2. Prepare an active test Student and a few available test books using the existing account/inventory pages. Use test accounts; do not change real Students just to demonstrate errors.
3. Open **Borrowing & Returns**, select **Borrow Book**, search/select the Student and Book, and check the automatic School ID/ISBN. Confirm today/seven-day defaults, then issue one copy.
4. Check that the active row appears with Student, book, dates and status. Open Book Inventory/Overview to verify stock decreased by one and active-loan totals increased.
5. Try issuing the same title again to the Student; it must fail. Issue different titles until the Student has three active loans, then confirm a fourth issue fails.
6. Search records by Student name, School ID, title or ISBN. Change status filters. For an overdue demonstration, issue an isolated test book with a past borrow date and past due date. It should immediately show Overdue; due today should remain Borrowed.
7. Select **Return Book**, cancel, and verify nothing changes. Repeat and confirm: active stock increases once, the row moves to Returned/history, and return date/staff attribution are shown. The backend rejects any duplicate return.
8. Log in as Student. Check **My Books**, current/returned/overdue filters, days remaining and history. Check dashboard counts/upcoming dates. No issue or return controls should appear. Changing a `student` query parameter cannot reveal another Student's history.
9. Refresh the browser or restart Express and verify loans/history persist. Check mobile layouts and overdue badges. After returning all copies of a test title, archive it and confirm its title remains available in historical loan rows.
10. Repeat key staff actions with the other staff role. Real concurrency/rollback tests are repeatable through the opt-in verifier rather than by manipulating real records.

## Limits and remaining work

- The current limit is three combined pending requests/active loans per Student, with no duplicate pending request or active loan for a title. Overdue copies count toward the limit.
- Search dropdowns show at most 50 matches; refine search for larger collections. Lists are paginated. Dates/limits are deliberately simple; there are no holiday calendars, renewal, fines, payment, reservation or email systems.
- The Student portal cannot issue or return books. Deactivated Students cannot sign in or receive new loans, but staff can still process their existing returns.
- Record titles/names are read from preserved references, so later edits to a name/title appear in history. There is no historical-text snapshot or record deletion workflow.
- This implementation requires Atlas transaction support, which was verified. It reports stock inconsistencies instead of silently repairing real records.
- Review this milestone manually before authorizing any further work. Nothing has been deployed.
