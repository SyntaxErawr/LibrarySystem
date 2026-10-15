const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../server');
const connectDB = require('../config/db');
const { jwtSecret } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Book = require('../models/Book');
const Borrowing = require('../models/Borrowing');
(async () => {
  const marker = randomBytes(10).toString('hex'), users = [], books = [];
  let server;
  const originalUpdate = Borrowing.updateOne;
  try {
    const dates = await import('../../shared/borrowingDates.mjs');
    await connectDB(); await User.init(); await Book.init(); await Borrowing.init();
    for (let i = 0; i < 5; i++) {
      const user = await User.create({ name: `Temporary request check ${i}`, email: `request-${marker}-${i}@example.test`, password: `Aa1!${randomBytes(18).toString('hex')}`, role: i ? 'student' : 'librarian', ...(i ? { studentId: `REQ-${marker}-${i}`, course: 'BSIT', yearLevel: '1st Year' } : {}) });
      users.push({ id: user._id, email: user.email, token: jwt.sign({ version: 0 }, jwtSecret(), { subject: String(user._id), issuer: 'library-api', audience: 'library-web', expiresIn: '10m' }) });
    }
    for (let i = 0; i < 5; i++) {
      const digits = '978' + [...randomBytes(9)].map(byte => byte % 10).join('');
      const isbn = digits + (10 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10;
      const book = await Book.create({ title: `Temporary request book ${marker}-${i}`, author: 'Verification', isbn, category: 'Verification', totalCopies: i ? 2 : 1, availableCopies: i ? 2 : 1 });
      books.push({ id: book._id, isbn });
    }
    server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = async (route, method = 'GET', body, user = users[0]) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const request = (user, book, extra = {}) => call('/borrowings/requests', 'POST', { book: String(book.id), ...extra }, user);
    const a = await request(users[1], books[0], { student: String(users[2].id), status: 'borrowed' });
    const b = await request(users[2], books[0]);
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    assert.equal(String(a.body.borrowing.student._id), String(users[1].id));
    assert.equal((await Book.findById(books[0].id)).availableCopies, 1);
    assert.equal((await request(users[1], books[0])).status, 409);
    assert.equal((await call(`/borrowings/${a.body.borrowing._id}/cancel`, 'PATCH', {}, users[2])).status, 404);
    assert.equal((await call(`/borrowings/${a.body.borrowing._id}/approve`, 'PATCH', {}, users[1])).status, 403);
    const competing = await Promise.all([a, b].map(result => call(`/borrowings/${result.body.borrowing._id}/approve`, 'PATCH', {})));
    assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
    const winner = competing.find(result => result.status === 200).body.borrowing;
    assert.equal((await Book.findById(books[0].id)).availableCopies, 0);
    assert.equal((await call(`/borrowings/${winner._id}/approve`, 'PATCH', {})).status, 409);
    assert.equal((await call(`/borrowings/${winner._id}/return`, 'PATCH')).status, 200);
    assert.equal((await Book.findById(books[0].id)).availableCopies, 1);
    console.log('PASS: persisted JWT-owned pending requests do not change stock; competing approvals issue the last copy only once, and returns remain correct.');
    const pending = [];
    for (let i = 1; i <= 3; i++) { const result = await request(users[3], books[i]); assert.equal(result.status, 201); pending.push(result.body.borrowing); }
    assert.equal((await request(users[3], books[4])).status, 409);
    const approved = await call(`/borrowings/${pending[0]._id}/approve`, 'PATCH', { dueDate: dates.addDays(dates.dateKey(), 9), borrowedAt: '2000-01-01' });
    assert.equal(approved.status, 200); assert.equal(dates.dateKey(approved.body.borrowing.borrowedAt), dates.dateKey());
    assert.equal((await request(users[3], books[1])).status, 409);
    assert.equal((await request(users[3], books[4])).status, 409);
    const stockBeforeReject = (await Book.findById(books[2].id)).availableCopies;
    assert.equal((await call(`/borrowings/${pending[1]._id}/reject`, 'PATCH', { reason: ' ' })).status, 400);
    assert.equal((await call(`/borrowings/${pending[1]._id}/reject`, 'PATCH', { reason: 'Please visit the desk.' })).status, 200);
    assert.equal((await Book.findById(books[2].id)).availableCopies, stockBeforeReject);
    assert.equal((await call(`/borrowings/${pending[2]._id}/cancel`, 'PATCH', {}, users[3])).status, 200);
    const history = await call('/borrowings/my?status=history', 'GET', undefined, users[3]);
    assert.ok(history.body.borrowings.some(record => record.status === 'rejected' && record.rejectionReason));
    assert.ok(history.body.borrowings.some(record => record.status === 'cancelled'));
    const summary = await call('/borrowings/summary', 'GET', undefined, users[3]);
    assert.equal(summary.body.activeCount, 1); assert.equal(summary.body.pendingCount, 0);
    const statuses = await call(`/borrowings/requests/status?books=${books.map(book => book.id).join(',')}`, 'GET', undefined, users[3]);
    assert.equal(statuses.status, 200); assert.ok(statuses.body.requests.some(record => record.status === 'rejected'));
    const rollback = await request(users[4], books[4]); assert.equal(rollback.status, 201);
    const before = await Book.findById(books[4].id);
    Borrowing.updateOne = function (filter, update, options) { if (String(filter._id) === rollback.body.borrowing._id && update.$set?.status === 'borrowed') throw new Error('Fixture-only approval failure'); return originalUpdate.call(this, filter, update, options); };
    try { assert.equal((await call(`/borrowings/${rollback.body.borrowing._id}/approve`, 'PATCH', {})).status, 500); }
    finally { Borrowing.updateOne = originalUpdate; }
    const after = await Book.findById(books[4].id);
    assert.equal(after.availableCopies, before.availableCopies); assert.equal(after.__v, before.__v);
    assert.equal((await Borrowing.findById(rollback.body.borrowing._id)).status, 'pending');
    assert.equal((await call('/books/stats')).status, 200);
    console.log('PASS: combined limit, adjusted due dates, reject/cancel history and reasons, catalog status, accurate counts and atomic approval rollback.');
  } catch (error) { console.error(JSON.stringify({ verification: 'failed', errorType: error.name, code: typeof error.code === 'number' ? error.code : undefined })); process.exitCode = 1; }
  finally {
    Borrowing.updateOne = originalUpdate;
    try {
      if (mongoose.connection.readyState === 1) {
        for (const book of books) {
          await Borrowing.collection.deleteMany({ book: book.id, student: { $in: users.slice(1).map(user => user.id) } });
          await Book.collection.deleteOne({ _id: book.id, isbn: book.isbn });
        }
        for (const user of users) await User.collection.deleteOne({ _id: user.id, email: user.email });
        console.log('Exact temporary request/loan, book and user fixtures removed; existing records unchanged.');
      }
    } catch { console.error('Temporary fixture cleanup failed; review verification records locally.'); process.exitCode = 1; }
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
})();
