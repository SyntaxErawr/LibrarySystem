// Opt-in live verification. Only uniquely marked records created here are cleaned up.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../server');
const connectDB = require('../config/db');
const User = require('../models/User');
const Book = require('../models/Book');
const { jwtSecret } = require('../middleware/authMiddleware');
(async () => {
  const marker = randomBytes(10).toString('hex');
  const staffEmail = `book-check-${marker}@example.test`, studentEmail = `book-student-${marker}@example.test`;
  let staffId, studentId, bookId, loanId, server;
  const digits = '978' + [...randomBytes(9)].map(byte => byte % 10).join('');
  const isbn = digits + (10 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10;
  try {
    await connectDB(); await User.init(); await Book.init();
    const staff = await User.create({ name: 'Temporary book verification', email: staffEmail, password: `Aa1!${randomBytes(18).toString('hex')}`, role: 'librarian' });
    staffId = staff._id;
    const student = await User.create({ name: 'Temporary book student', email: studentEmail, password: `Aa1!${randomBytes(18).toString('hex')}`, role: 'student', studentId: `BOOK-${marker}`, course: 'BSIT', yearLevel: '1st Year' });
    studentId = student._id;
    const token = user => jwt.sign({ version: user.tokenVersion }, jwtSecret(), { subject: String(user._id), issuer: 'library-api', audience: 'library-web', expiresIn: '5m' });
    const staffToken = token(staff), studentToken = token(student);
    server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = async (route, method = 'GET', body, auth = staffToken) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/books${route}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const payload = { title: `Book verification ${marker}`, author: 'Temporary test author', isbn, category: `Test-${marker}`, totalCopies: 3, publicationYear: 2020 };
    const created = await call('', 'POST', payload);
    const saved = await Book.findOne({ isbn, title: payload.title }); bookId = saved?._id;
    assert.equal(created.status, 201); assert.equal(saved.availableCopies, 3);
    assert.equal((await call('', 'POST', payload)).status, 409);
    assert.equal((await call(`?search=${marker}`, 'GET', undefined, studentToken)).body.total, 1);
    const updated = await call(`/${bookId}`, 'PUT', { ...payload, totalCopies: 5, version: saved.__v });
    assert.equal(updated.status, 200); assert.equal(updated.body.book.availableCopies, 5);
    // Isolated loan fixture only, not a borrowing API or change to real inventory.
    const loan = await mongoose.connection.collection('borrowings').insertOne({ book: bookId, student: studentId, borrowedAt: new Date(), dueAt: new Date(Date.now() + 86400000), returnedAt: null, status: 'borrowed' });
    loanId = loan.insertedId;
    await Book.collection.updateOne({ _id: bookId, isbn }, { $set: { availableCopies: 4 }, $inc: { __v: 1 } });
    const borrowed = await Book.findById(bookId);
    assert.equal((await call(`/${bookId}`, 'PUT', { ...payload, totalCopies: 0, version: borrowed.__v })).status, 400);
    assert.equal((await call(`/${bookId}`, 'DELETE')).status, 409);
    const increased = await call(`/${bookId}`, 'PUT', { ...payload, totalCopies: 6, version: borrowed.__v });
    assert.equal(increased.status, 200); assert.equal(increased.body.book.availableCopies, 5);
    const stats = await call('/stats'); assert.equal(stats.status, 200); assert.ok(stats.body.stats.borrowedCopies >= 1);
    await mongoose.connection.collection('borrowings').updateOne({ _id: loanId, book: bookId }, { $set: { status: 'returned', returnedAt: new Date() } });
    await Book.collection.updateOne({ _id: bookId, isbn }, { $set: { availableCopies: 6 }, $inc: { __v: 1 } });
    assert.equal((await call(`/${bookId}`, 'DELETE')).status, 200);
    assert.equal((await Book.findById(bookId)).isActive, false);
    assert.ok(await mongoose.connection.collection('borrowings').findOne({ _id: loanId, book: bookId }));
    assert.equal((await call(`/${bookId}`, 'GET', undefined, studentToken)).status, 404);
    console.log('PASS: Atlas book persistence, unique ISBN, search, stock transactions, active-loan safeguards, dashboard data and archive/history preservation.');
  } catch (error) {
    console.error(JSON.stringify({ verification: 'failed', errorType: error.name, code: typeof error.code === 'number' ? error.code : undefined })); process.exitCode = 1;
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        if (loanId) await mongoose.connection.collection('borrowings').deleteOne({ _id: loanId, book: bookId });
        if (bookId) await Book.collection.deleteOne({ _id: bookId, isbn });
        if (staffId) await User.collection.deleteOne({ _id: staffId, email: staffEmail });
        if (studentId) await User.collection.deleteOne({ _id: studentId, email: studentEmail });
        console.log('Isolated book, loan fixture and test accounts cleaned up; existing records unchanged.');
      }
    } catch { console.error('Test cleanup failed; inspect temporary verification records locally.'); process.exitCode = 1; }
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
})();
