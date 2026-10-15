const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../server');
const User = require('../models/User');
const Book = require('../models/Book');
const Borrowing = require('../models/Borrowing');
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const id = () => new mongoose.Types.ObjectId().toHexString();
const users = new Map(), books = new Map(), loans = new Map();
const staff = ['admin', 'librarian'].map(role => ({ _id: id(), role, name: role, isActive: true, tokenVersion: 0 }));
const students = Array.from({ length: 4 }, (_, i) => ({ _id: id(), role: 'student', name: `Student ${i}`, studentId: `LOAN-${i}`, isActive: true, tokenVersion: 0 }));
[...staff, ...students].forEach(user => users.set(user._id, user));
const titles = Array.from({ length: 6 }, (_, i) => ({ _id: id(), title: `Book ${i}`, author: 'Test Author', isbn: `ISBN-${i}`, totalCopies: 2, availableCopies: 2, isActive: true, __v: 0 }));
titles.forEach(book => books.set(book._id, book));
function expr(value, row) {
  if (typeof value === 'string' && value.startsWith('$')) return row[value.slice(1)] ?? null;
  if (!value || value instanceof Date || typeof value !== 'object') return value;
  const [op, args] = Object.entries(value)[0]; const values = args.map(item => expr(item, row));
  if (op === '$ifNull') return values[0] ?? values[1];
  if (op === '$and') return values.every(Boolean); if (op === '$or') return values.some(Boolean);
  if (op === '$lt') return values[0] < values[1]; if (op === '$gte') return values[0] >= values[1];
  if (op === '$eq') return values[0] === values[1]; if (op === '$ne') return values[0] !== values[1];
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part));
    if (key === '$and') return value.every(part => matches(row, part));
    if (key === '$expr') return expr(value, row);
    if (value === null) return row[key] == null;
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, right]) => op === '$ne' ? row[key] !== right : op === '$in' ? right.includes(row[key]) : op === '$gt' ? row[key] > right : op === '$lt' ? row[key] < right : op === '$regex' ? new RegExp(right, value.$options).test(row[key] || '') : true);
    return String(row[key]) === String(value);
  });
}
function query(get, populate = false) {
  let offset = 0, limit = Infinity, order;
  const materialize = () => {
    let value = get();
    if (Array.isArray(value)) {
      if (order) { const [field, direction] = Object.entries(order)[0]; value.sort((a, b) => a[field] > b[field] ? direction : -direction); }
      value = value.slice(offset, offset + limit);
    }
    const show = item => item && populate ? { ...item, student: users.get(item.student), book: books.get(item.book), issuedBy: users.get(item.issuedBy), returnedBy: users.get(item.returnedBy) } : item;
    return Array.isArray(value) ? value.map(show) : show(value);
  };
  const chain = { select: () => chain, lean: () => chain, session: () => chain, populate: () => { populate = true; return chain; }, sort: value => { order = value; return chain; }, skip: value => { offset = value; return chain; }, limit: value => { limit = value; return chain; }, then: (resolve, reject) => Promise.resolve().then(materialize).then(resolve, reject) };
  return chain;
}
User.findById = key => query(() => users.get(String(key)));
User.find = filter => query(() => [...users.values()].filter(user => matches(user, filter)));
User.findOneAndUpdate = async filter => [...users.values()].find(user => matches(user, filter));
User.updateOne = async () => ({ modifiedCount: 1 });
Book.findById = key => query(() => books.get(String(key)));
Book.find = filter => query(() => [...books.values()].filter(book => matches(book, filter)));
function update(map, filter, change) {
  const value = [...map.values()].find(row => matches(row, filter));
  if (!value) return { modifiedCount: 0 };
  Object.assign(value, change.$set);
  for (const [key, increment] of Object.entries(change.$inc || {})) value[key] = (value[key] || 0) + increment;
  return { modifiedCount: 1 };
}
Book.updateOne = async (filter, change) => update(books, filter, change);
Borrowing.findById = key => query(() => loans.get(String(key)));
Borrowing.find = filter => query(() => [...loans.values()].filter(loan => matches(loan, filter)));
Borrowing.exists = filter => query(() => [...loans.values()].find(loan => matches(loan, filter)));
Borrowing.countDocuments = filter => query(() => [...loans.values()].filter(loan => matches(loan, filter)).length);
Borrowing.updateOne = async (filter, change) => update(loans, filter, change);
Borrowing.aggregate = async pipeline => {
  const filter = pipeline[0].$match;
  const ids = filter.book.$in.map(String);
  const found = [...loans.values()].filter(loan => String(loan.student) === String(filter.student) && ids.includes(String(loan.book))).sort((a, b) => Number(['pending', 'borrowed', 'overdue'].includes(b.status)) - Number(['pending', 'borrowed', 'overdue'].includes(a.status)) || b.createdAt - a.createdAt);
  return [...new Map(found.reverse().map(loan => [loan.book, loan])).values()];
};
let failCreate = false;
Borrowing.create = async ([body]) => {
  if (failCreate) throw new Error('Private database failure');
  const loan = { ...body, _id: id(), returnedAt: null, returnedBy: null, createdAt: new Date() };
  loans.set(loan._id, loan); return [loan];
};
// In-memory transactions exercise controller rollback; actual Mongo concurrency is
// verified separately by the opt-in Atlas script, not claimed from this mutex.
let queue = Promise.resolve();
mongoose.startSession = async () => ({ endSession: async () => {}, withTransaction: callback => {
  const run = queue.then(async () => {
    const backups = [users, books, loans].map(map => structuredClone([...map]));
    try { return await callback(); } catch (error) { [users, books, loans].forEach((map, i) => { map.clear(); backups[i].forEach(([key, value]) => map.set(key, value)); }); throw error; }
  }); queue = run.catch(() => {}); return run;
} });
const token = user => jwt.sign({ version: 0 }, process.env.JWT_SECRET, { subject: user._id, issuer: 'library-api', audience: 'library-web', expiresIn: '1h' });
const server = createApp().listen(0, '127.0.0.1'); const ready = once(server, 'listening');
after(() => new Promise(resolve => server.close(resolve)));
async function call(route = '', method = 'GET', body, user = staff[0]) {
  await ready;
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/borrowings${route}`, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
test('borrowing and return scenarios', async t => {
  const dates = await import('../../shared/borrowingDates.mjs');
  const body = (student = students[0], book = titles[0]) => ({ student: student._id, book: book._id, borrowedAt: dates.dateKey(), dueDate: dates.addDays(dates.dateKey(), 7) });
  let first, second;
  await t.test('Admin issues one copy and records dates/staff', async () => {
    const result = await call('', 'POST', body()); assert.equal(result.status, 201);
    first = result.data.borrowing; assert.equal(first.issuedBy._id, staff[0]._id);
    assert.equal(books.get(titles[0]._id).availableCopies, 1); assert.equal(first.status, 'borrowed');
    assert.equal(dates.dateKey(first.dueDate), body().dueDate);
  });
  await t.test('Librarian issues one copy', async () => {
    const result = await call('', 'POST', body(students[1]), staff[1]); assert.equal(result.status, 201); second = result.data.borrowing;
    assert.equal(books.get(titles[0]._id).availableCopies, 0);
  });
  await t.test('zero stock and duplicate active loans fail', async () => {
    assert.equal((await call('', 'POST', body(students[2]))).status, 409);
    assert.equal((await call('', 'POST', body())).status, 409);
  });
  await t.test('Students cannot issue, return, list all records or search other Students', async () => {
    assert.equal((await call('', 'POST', body(), students[0])).status, 403);
    assert.equal((await call(`/${first._id}/return`, 'PATCH', {}, students[0])).status, 403);
    assert.equal((await call('', 'GET', undefined, students[0])).status, 403);
    assert.equal((await call('/students', 'GET', undefined, students[0])).status, 403);
    assert.equal((await call('', 'GET', undefined, null)).status, 401);
  });
  await t.test('inactive Students and archived books cannot borrow', async () => {
    users.get(students[2]._id).isActive = false;
    assert.equal((await call('', 'POST', body(students[2], titles[1]))).status, 400);
    users.get(students[2]._id).isActive = true; books.get(titles[1]._id).isActive = false;
    assert.equal((await call('', 'POST', body(students[2], titles[1]))).status, 400);
    books.get(titles[1]._id).isActive = true;
  });
  await t.test('missing IDs, wrong roles and invalid/future dates are rejected', async () => {
    for (const patch of [{ student: '' }, { book: 'invalid' }, { student: staff[0]._id }, { borrowedAt: '2026-02-30' }, { dueDate: 'invalid' }, { dueDate: dates.addDays(dates.dateKey(), -1) }, { borrowedAt: dates.addDays(dates.dateKey(), 1) }]) assert.equal((await call('', 'POST', { ...body(students[2], titles[1]), ...patch })).status, 400);
  });
  await t.test('three-active-book limit is enforced', async () => {
    assert.equal((await call('', 'POST', body(students[0], titles[1]))).status, 201);
    assert.equal((await call('', 'POST', body(students[0], titles[2]))).status, 201);
    assert.equal((await call('', 'POST', body(students[0], titles[3]))).status, 409);
  });
  await t.test('each Student sees only own history despite altered parameters', async () => {
    const result = await call(`/my?student=${students[1]._id}`, 'GET', undefined, students[0]);
    assert.equal(result.status, 200); assert.equal(result.data.total, 3);
    assert.ok(result.data.borrowings.every(loan => loan.student._id === students[0]._id));
    const summary = await call('/summary', 'GET', undefined, students[1]); assert.equal(summary.data.activeCount, 1);
  });
  await t.test('Admin returns once, records actual return/staff and retains history', async () => {
    assert.equal((await call(`/${first._id}/return`, 'PATCH', {})).status, 200);
    assert.equal(books.get(titles[0]._id).availableCopies, 1);
    assert.equal(loans.get(first._id).status, 'returned'); assert.ok(loans.get(first._id).returnedAt);
    assert.equal(loans.get(first._id).returnedBy, staff[0]._id);
    assert.equal((await call(`/${first._id}/return`, 'PATCH', {})).status, 409);
    assert.equal(books.get(titles[0]._id).availableCopies, 1);
  });
  await t.test('Librarian can return for a deactivated Student', async () => {
    users.get(students[1]._id).isActive = false;
    assert.equal((await call(`/${second._id}/return`, 'PATCH', {}, staff[1])).status, 200);
    assert.equal(books.get(titles[0]._id).availableCopies, 2); users.get(students[1]._id).isActive = true;
  });
  await t.test('overdue status, filters, search and summaries use actual records', async () => {
    const result = await call('', 'POST', { ...body(students[2], titles[0]), borrowedAt: dates.addDays(dates.dateKey(), -8), dueDate: dates.addDays(dates.dateKey(), -1) });
    assert.equal(result.data.borrowing.displayStatus, 'overdue'); assert.equal(result.data.borrowing.daysRemaining, -1);
    assert.equal((await call('?status=overdue')).data.total, 1);
    assert.equal((await call('?status=returned')).data.total, 2);
    assert.equal((await call('?search=LOAN-2')).data.total, 1);
    assert.equal((await call('/summary')).data.overdueCount, 1);
    assert.equal((await call('/summary', 'GET', undefined, students[0])).data.activeCount, 2);
    assert.equal((await call('?status=invalid')).status, 400);
  });
  await t.test('Manila due-day boundaries and invalid calendar dates are handled consistently', () => {
    const loan = { dueDate: dates.dayEnd('2026-10-16'), status: 'borrowed' };
    assert.equal(dates.loanStatus(loan, '2026-10-16T15:59:59Z'), 'borrowed');
    assert.equal(dates.loanStatus(loan, '2026-10-16T16:00:00Z'), 'overdue');
    assert.equal(dates.validDateKey('2026-13-99'), false); assert.equal(dates.validDateKey('2026-02-29'), false);
    assert.equal(dates.daysRemaining({ status: 'borrowed' }), null);
  });
  await t.test('failed issue rolls back stock and loan creation', async () => {
    const before = books.get(titles[4]._id).availableCopies; const count = loans.size;
    failCreate = true;
    try { assert.equal((await call('', 'POST', body(students[3], titles[4]))).status, 500); }
    finally { failCreate = false; }
    assert.equal(books.get(titles[4]._id).availableCopies, before); assert.equal(loans.size, count);
  });
  await t.test('simultaneous last-copy issues cannot oversubscribe the in-memory transaction fixture', async () => {
    const book = books.get(titles[5]._id); book.totalCopies = 1; book.availableCopies = 1;
    const results = await Promise.all([call('', 'POST', body(students[1], titles[5])), call('', 'POST', body(students[3], titles[5]))]);
    assert.deepEqual(results.map(item => item.status).sort(), [201, 409]); assert.equal(books.get(titles[5]._id).availableCopies, 0);
  });
  await t.test('invalid/missing loan IDs fail safely and indexes protect active pairs', async () => {
    assert.equal((await call('/bad/return', 'PATCH', {})).status, 400);
    assert.equal((await call(`/${id()}/return`, 'PATCH', {})).status, 404);
    assert.ok(Borrowing.schema.indexes().some(([keys, options]) => keys.student && keys.book && options.unique));
  });
  const requester = { _id: id(), role: 'student', name: 'Requester', studentId: 'REQUEST-001', isActive: true, tokenVersion: 0 };
  const stranger = { ...requester, _id: id(), name: 'Other Student' };
  users.set(requester._id, requester); users.set(stranger._id, stranger);
  const requestBooks = Array.from({ length: 5 }, (_, i) => ({ _id: id(), title: `Request Book ${i}`, isbn: `REQUEST-${i}`, author: 'Test', totalCopies: 2, availableCopies: 2, isActive: true, __v: 0 }));
  requestBooks.forEach(book => books.set(book._id, book));
  const request = (book = requestBooks[0], user = requester, extra = {}) => call('/requests', 'POST', { book: book._id, ...extra }, user);
  let pendingId;
  await t.test('Student request uses JWT identity, stores pending/date and leaves stock unchanged', async () => {
    const result = await request(requestBooks[0], requester, { student: stranger._id, status: 'borrowed', issuedBy: staff[0]._id });
    assert.equal(result.status, 201); pendingId = result.data.borrowing._id;
    assert.equal(result.data.borrowing.student._id, requester._id); assert.equal(result.data.borrowing.status, 'pending');
    assert.ok(result.data.borrowing.requestedAt); assert.equal(result.data.borrowing.borrowedAt, undefined);
    assert.equal(books.get(requestBooks[0]._id).availableCopies, 2);
    assert.equal((await call('/summary', 'GET', undefined, requester)).data.activeCount, 0);
    assert.equal((await call('/summary', 'GET', undefined, requester)).data.pendingCount, 1);
  });
  await t.test('pending duplicates, archived/unavailable titles and staff self-requests are rejected', async () => {
    assert.equal((await request()).status, 409);
    const book = books.get(requestBooks[1]._id); book.isActive = false;
    assert.equal((await request(requestBooks[1])).status, 400); books.get(book._id).isActive = true; books.get(book._id).availableCopies = 0;
    assert.equal((await request(requestBooks[1])).status, 409); books.get(book._id).availableCopies = 2;
    assert.equal((await request(requestBooks[1], staff[0])).status, 403);
    assert.equal((await call(`/${pendingId}/approve`, 'PATCH', {}, requester)).status, 403);
    assert.equal((await call(`/${pendingId}/reject`, 'PATCH', { reason: 'No' }, requester)).status, 403);
  });
  await t.test('own pending list/catalog status never reveal another Student and cancellation is owner-only', async () => {
    assert.equal((await call(`/${pendingId}/cancel`, 'PATCH', {}, stranger)).status, 404);
    const mine = await call(`/my?status=pending&student=${stranger._id}`, 'GET', undefined, requester);
    assert.equal(mine.data.total, 1); assert.equal(mine.data.borrowings[0]._id, pendingId);
    const catalog = await call(`/requests/status?books=${requestBooks[0]._id}`, 'GET', undefined, requester);
    assert.equal(catalog.data.requests[0].status, 'pending');
    assert.equal((await call(`/${pendingId}/cancel`, 'PATCH', {}, requester)).status, 200);
    assert.equal(loans.get(pendingId).status, 'cancelled'); assert.equal(books.get(requestBooks[0]._id).availableCopies, 2);
  });
  await t.test('Librarian approves and issues the same request once with server issuance date', async () => {
    const created = await request(); pendingId = created.data.borrowing._id;
    const dueDate = dates.addDays(dates.dateKey(), 10);
    const approved = await call(`/${pendingId}/approve`, 'PATCH', { dueDate, borrowedAt: '2000-01-01' }, staff[1]);
    assert.equal(approved.status, 200); assert.equal(approved.data.borrowing._id, pendingId);
    assert.equal(dates.dateKey(approved.data.borrowing.borrowedAt), dates.dateKey());
    assert.equal(dates.dateKey(approved.data.borrowing.dueDate), dueDate);
    assert.equal(approved.data.borrowing.issuedBy._id, staff[1]._id);
    assert.equal(books.get(requestBooks[0]._id).availableCopies, 1);
    assert.equal((await call(`/${pendingId}/approve`, 'PATCH', {}, staff[0])).status, 409);
    assert.equal((await call(`/${pendingId}/cancel`, 'PATCH', {}, requester)).status, 409);
    assert.equal((await request()).status, 409);
  });
  await t.test('combined pending and active limit also constrains direct issue', async () => {
    assert.equal((await request(requestBooks[1])).status, 201);
    assert.equal((await request(requestBooks[2])).status, 201);
    assert.equal((await request(requestBooks[3])).status, 409);
    assert.equal((await call('', 'POST', body(requester, requestBooks[3]))).status, 409);
    assert.equal((await call(`/${pendingId}/return`, 'PATCH', {})).status, 200);
    assert.equal(books.get(requestBooks[0]._id).availableCopies, 2);
  });
  await t.test('Admin rejects with a required reason, history includes rejected/cancelled and stock is unchanged', async () => {
    const record = [...loans.values()].find(loan => loan.student === requester._id && loan.status === 'pending');
    assert.equal((await call(`/${record._id}/reject`, 'PATCH', { reason: '   ' })).status, 400);
    assert.equal((await call(`/${record._id}/reject`, 'PATCH', { reason: '  Please visit the library desk.  ' })).status, 200);
    assert.equal(loans.get(record._id).rejectionReason, 'Please visit the library desk.');
    assert.equal(books.get(record.book).availableCopies, 2);
    const history = await call('/my?status=history', 'GET', undefined, requester);
    assert.ok(history.data.borrowings.some(loan => loan.status === 'rejected' && loan.rejectionReason));
    assert.ok(history.data.borrowings.some(loan => loan.status === 'cancelled'));
  });
  await t.test('failed approval rolls back stock and keeps the request pending', async () => {
    const result = await request(requestBooks[4]); const recordId = result.data.borrowing._id;
    const original = Borrowing.updateOne;
    Borrowing.updateOne = async (filter, change) => { if (filter._id === recordId) throw new Error('Fixture-only failure'); return original(filter, change); };
    try { assert.equal((await call(`/${recordId}/approve`, 'PATCH', {})).status, 500); }
    finally { Borrowing.updateOne = original; }
    assert.equal(loans.get(recordId).status, 'pending'); assert.equal(books.get(requestBooks[4]._id).availableCopies, 2);
    assert.equal((await call(`/${recordId}/approve`, 'PATCH', {}, staff[0])).status, 200);
  });
});
