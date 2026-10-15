// Opt-in Atlas verification. Only exact, newly created fixture IDs are cleaned up.
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
  const marker = randomBytes(10).toString('hex');
  const users = [], books = [];
  let server;
  const originalCreate = Borrowing.create;
  try {
    const dates = await import('../../shared/borrowingDates.mjs');
    await connectDB(); await User.init(); await Book.init(); await Borrowing.init();
    for (let index = 0; index < 5; index++) {
      const user = await User.create({ name: `Temporary loan verification ${index}`, email: `loan-${marker}-${index}@example.test`, password: `Aa1!${randomBytes(18).toString('hex')}`, role: index === 0 ? 'librarian' : 'student', ...(index ? { studentId: `LOAN-${marker}-${index}`, course: 'BSIT', yearLevel: '1st Year' } : {}) });
      users.push({ id: user._id, email: user.email, token: jwt.sign({ version: 0 }, jwtSecret(), { subject: String(user._id), issuer: 'library-api', audience: 'library-web', expiresIn: '10m' }) });
    }
    for (let index = 0; index < 6; index++) {
      const digits = '978' + [...randomBytes(9)].map(byte => byte % 10).join('');
      const isbn = digits + (10 - [...digits].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10) % 10;
      const book = await Book.create({ title: `Temporary loan book ${marker}-${index}`, author: 'Verification', isbn, category: 'Verification', totalCopies: index === 0 ? 1 : 2, availableCopies: index === 0 ? 1 : 2 });
      books.push({ id: book._id, isbn });
    }
    server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = async (route, method = 'GET', body, user = users[0]) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const issue = (student, book, patch = {}) => call('/borrowings', 'POST', { student: String(student.id), book: String(book.id), borrowedAt: dates.dateKey(), dueDate: dates.addDays(dates.dateKey(), 7), ...patch });
    const first = await issue(users[1], books[1], { borrowedAt: dates.addDays(dates.dateKey(), -8), dueDate: dates.addDays(dates.dateKey(), -1) });
    assert.equal(first.status, 201); assert.equal(first.body.borrowing.displayStatus, 'overdue');
    assert.equal((await issue(users[1], books[1])).status, 409);
    const capped = await Promise.all([2, 3, 4].map(index => issue(users[1], books[index])));
    assert.deepEqual(capped.map(result => result.status).sort(), [201, 201, 409]);
    assert.equal(await Borrowing.countDocuments({ student: users[1].id, returnedAt: null }), 3);
    console.log('PASS: real concurrent issues enforce the three-active-book limit across different titles.');
    const lastCopy = await Promise.all([issue(users[2], books[0]), issue(users[3], books[0])]);
    assert.deepEqual(lastCopy.map(result => result.status).sort(), [201, 409]);
    assert.equal((await Book.findById(books[0].id)).availableCopies, 0);
    assert.equal((await issue(users[4], books[0])).status, 409);
    const won = lastCopy.find(result => result.status === 201).body.borrowing;
    const returned = await Promise.all([call(`/borrowings/${won._id}/return`, 'PATCH'), call(`/borrowings/${won._id}/return`, 'PATCH')]);
    assert.deepEqual(returned.map(result => result.status).sort(), [200, 409]);
    assert.equal((await Book.findById(books[0].id)).availableCopies, 1);
    console.log('PASS: real concurrent last-copy issues and repeated returns preserve exact stock.');
    const before = await Book.findById(books[5].id);
    Borrowing.create = async function (documents, options) {
      if (String(documents[0].book) === String(books[5].id)) throw new Error('Simulated fixture-only persistence failure');
      return originalCreate.call(this, documents, options);
    };
    try { assert.equal((await issue(users[4], books[5])).status, 500); }
    finally { Borrowing.create = originalCreate; }
    const after = await Book.findById(books[5].id);
    assert.equal(after.availableCopies, before.availableCopies); assert.equal(after.__v, before.__v);
    assert.equal(await Borrowing.countDocuments({ book: books[5].id }), 0);
    console.log('PASS: an injected loan-write failure rolls back the preceding stock write in Atlas.');
    await User.collection.updateOne({ _id: users[4].id, email: users[4].email }, { $set: { isActive: false } });
    assert.equal((await issue(users[4], books[5])).status, 400);
    await User.collection.updateOne({ _id: users[4].id, email: users[4].email }, { $set: { isActive: true } });
    await Book.collection.updateOne({ _id: books[5].id, isbn: books[5].isbn }, { $set: { isActive: false } });
    assert.equal((await issue(users[4], books[5])).status, 400);
    await Book.collection.updateOne({ _id: books[5].id, isbn: books[5].isbn }, { $set: { isActive: true } });
    assert.equal((await call(`/books/${books[1].id}`, 'DELETE')).status, 409);
    assert.equal((await call('/borrowings', 'GET', undefined, users[1])).status, 403);
    assert.equal((await call('/borrowings', 'POST', {}, users[1])).status, 403);
    assert.equal((await call(`/borrowings/${first.body.borrowing._id}/return`, 'PATCH', {}, users[1])).status, 403);
    const mine = await call(`/borrowings/my?student=${users[2].id}`, 'GET', undefined, users[1]);
    assert.equal(mine.body.total, 3); assert.ok(mine.body.borrowings.every(loan => String(loan.student._id) === String(users[1].id)));
    const summary = await call('/borrowings/summary', 'GET', undefined, users[1]);
    assert.equal(summary.body.activeCount, 3); assert.equal(summary.body.overdueCount, 1);
    const filtered = await call(`/borrowings?search=${encodeURIComponent(marker)}&status=overdue`);
    assert.equal(filtered.body.total, 1);
    for (const book of books) {
      const stored = await Book.findById(book.id);
      assert.equal(stored.totalCopies - stored.availableCopies, await Borrowing.countDocuments({ book: book.id, returnedAt: null, status: 'borrowed' }));
    }
    const saved = await Borrowing.findById(won._id);
    assert.equal(saved.status, 'returned'); assert.ok(saved.returnedAt); assert.equal(String(saved.returnedBy), String(users[0].id));
    console.log('PASS: persisted dates/staff/history, overdue search/summary, eligibility, archive guards and Student privacy.');
  } catch (error) {
    console.error(JSON.stringify({ verification: 'failed', errorType: error.name, code: typeof error.code === 'number' ? error.code : undefined })); process.exitCode = 1;
  } finally {
    Borrowing.create = originalCreate;
    try {
      if (mongoose.connection.readyState === 1) {
        const studentIds = users.slice(1).map(user => user.id);
        for (const book of books) {
          await Borrowing.collection.deleteMany({ book: book.id, student: { $in: studentIds }, issuedBy: users[0].id });
          await Book.collection.deleteOne({ _id: book.id, isbn: book.isbn });
        }
        for (const user of users) await User.collection.deleteOne({ _id: user.id, email: user.email });
        console.log('Exact temporary loans, books and users cleaned up; real student/inventory records unchanged.');
      }
    } catch { console.error('Fixture cleanup failed. Review temporary verification records locally.'); process.exitCode = 1; }
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
})();
