const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../server');
const Book = require('../models/Book');
const User = require('../models/User');
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const books = new Map(), loans = [];
const users = ['admin', 'librarian', 'student'].map(role => User.hydrate({ _id: new mongoose.Types.ObjectId(), name: role, email: `${role}@example.test`, role, isActive: true, tokenVersion: 0 }));
User.findById = id => ({ select: async () => users.find(user => String(user._id) === String(id)) });
const tokens = Object.fromEntries(users.map(user => [user.role, jwt.sign({ version: 0 }, process.env.JWT_SECRET, { subject: String(user._id), issuer: 'library-api', audience: 'library-web', expiresIn: '1h' })]));
const matches = (book, filter) => Object.entries(filter).every(([key, value]) => key === '$or' ? value.some(part => matches(book, part)) : value && typeof value === 'object' ? value.$regex !== undefined ? new RegExp(value.$regex, value.$options).test(book[key]) : book[key] > value.$gt : book[key] === value);
Book.collection.insertOne = async document => {
  if ([...books.values()].some(book => book.isbn === document.isbn)) throw Object.assign(new Error('Duplicate'), { code: 11000, keyPattern: { isbn: 1 } });
  books.set(String(document._id), { ...document });
  return { acknowledged: true, insertedId: document._id };
};
Book.collection.updateOne = async (filter, update) => {
  const book = books.get(String(filter._id));
  if (!book || book.__v !== filter.__v) return { acknowledged: true, matchedCount: 0 };
  Object.assign(book, update.$set);
  for (const field of Object.keys(update.$unset || {})) delete book[field];
  for (const [field, increment] of Object.entries(update.$inc || {})) book[field] += increment;
  return { acknowledged: true, matchedCount: 1 };
};
Book.findById = id => { const get = () => books.has(String(id)) ? Book.hydrate(books.get(String(id))) : null; return { then: resolve => Promise.resolve(get()).then(resolve), session: async () => get() }; };
Book.find = filter => ({ sort: () => ({ skip: offset => ({ limit: async limit => [...books.values()].filter(book => matches(book, filter)).slice(offset, offset + limit).map(book => Book.hydrate(book)) }) }) });
Book.countDocuments = async filter => [...books.values()].filter(book => matches(book, filter)).length;
Book.distinct = async (field, filter) => [...new Set([...books.values()].filter(book => matches(book, filter)).map(book => book[field]))];
Book.aggregate = async () => {
  const active = [...books.values()].filter(book => book.isActive);
  return active.length ? [active.reduce((stats, book) => ({ totalTitles: stats.totalTitles + 1, totalCopies: stats.totalCopies + book.totalCopies, availableCopies: stats.availableCopies + book.availableCopies, borrowedCopies: stats.borrowedCopies + book.totalCopies - book.availableCopies }), { totalTitles: 0, totalCopies: 0, availableCopies: 0, borrowedCopies: 0 })] : [];
};
mongoose.startSession = async () => ({ withTransaction: async callback => callback(), endSession: async () => {} });
const originalCollection = mongoose.connection.collection.bind(mongoose.connection);
mongoose.connection.collection = name => name === 'borrowings' ? { countDocuments: async filter => loans.filter(loan => String(loan.book) === String(filter.book) && loan.returnedAt == null && loan.status !== 'returned').length } : originalCollection(name);
const server = createApp().listen(0, '127.0.0.1');
const ready = once(server, 'listening');
after(() => new Promise(resolve => server.close(resolve)));
async function request(route, method = 'GET', body, role = 'admin') {
  await ready;
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/books${route}`, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const payload = { title: 'The C Programming Language', author: 'Kernighan and Ritchie', isbn: '978-0-13-110362-7', category: 'Programming', totalCopies: 3 };
test('book management and catalog scenarios', async t => {
  let first, second;
  await t.test('Admin creates a book, trims fields and initializes server-owned stock', async () => {
    const result = await request('', 'POST', { ...payload, title: ` ${payload.title} ` });
    assert.equal(result.status, 201); first = result.data.book;
    assert.equal(first.title, payload.title); assert.equal(first.isbn, '9780131103627');
    assert.equal(first.availableCopies, 3); assert.equal(first.status, 'Available');
  });
  await t.test('Librarian can create books', async () => {
    const result = await request('', 'POST', { ...payload, title: 'Introduction to Algorithms', author: 'Thomas Cormen', isbn: '9780262033848', category: 'Algorithms' }, 'librarian');
    assert.equal(result.status, 201); second = result.data.book;
  });
  await t.test('Student cannot create, edit, archive or read staff stats', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await request(method === 'POST' ? '' : `/${first._id}`, method, payload, 'student')).status, 403);
    assert.equal((await request('/stats', 'GET', undefined, 'student')).status, 403);
    assert.equal((await request('', 'GET', undefined, null)).status, 401);
  });
  await t.test('duplicate normalized ISBN is rejected', async () => {
    const result = await request('', 'POST', { ...payload, isbn: '9780131103627' });
    assert.equal(result.status, 409); assert.ok(result.data.fields.isbn);
  });
  await t.test('required fields, ISBN checksums, quantities, years and URLs are validated', async () => {
    for (const patch of [{ title: ' ' }, { author: '' }, { isbn: '9780131103628' }, { category: '' }, { totalCopies: -1 }, { totalCopies: 0 }, { totalCopies: 1.5 }, { totalCopies: true }, { publicationYear: -20 }, { publicationYear: new Date().getFullYear() + 2 }, { coverImageUrl: 'javascript:alert(1)' }]) assert.equal((await request('', 'POST', { ...payload, ...patch })).status, 400);
    assert.equal((await request('', 'POST', { ...payload, availableCopies: 99 })).status, 400);
  });
  await t.test('search by title, author and formatted ISBN returns matching active books', async () => {
    for (const search of ['programming', 'Ritchie', '978-0-13-110362-7']) {
      const result = await request(`?search=${encodeURIComponent(search)}`, 'GET', undefined, 'student');
      assert.equal(result.data.total, 1); assert.equal(result.data.books[0]._id, first._id);
    }
    assert.equal((await request('?search=%5B.*')).data.total, 0);
  });
  await t.test('category/availability filters, pagination and empty results work', async () => {
    assert.equal((await request('?category=Algorithms')).data.total, 1);
    assert.equal((await request('?availability=available')).data.total, 2);
    assert.equal((await request('?availability=unavailable')).data.total, 0);
    assert.equal((await request('?limit=1')).data.pages, 2);
    assert.equal((await request('?page=-1')).status, 400);
    assert.equal((await request('?availability=bad')).status, 400);
  });
  await t.test('Admin edits quantity and details, keeping availability consistent', async () => {
    const result = await request(`/${first._id}`, 'PUT', { ...payload, totalCopies: 5, publisher: 'Prentice Hall', publicationYear: 1988, version: first.__v });
    assert.equal(result.status, 200); first = result.data.book;
    assert.equal(first.availableCopies, 5); assert.equal(first.publisher, 'Prentice Hall');
  });
  await t.test('Librarian edits and cannot submit stale data or arbitrary availability', async () => {
    const result = await request(`/${second._id}`, 'PUT', { ...payload, isbn: second.isbn, totalCopies: 0, version: second.__v }, 'librarian');
    assert.equal(result.status, 200); second = result.data.book; assert.equal(second.status, 'Unavailable');
    assert.equal((await request(`/${second._id}`, 'PUT', { ...payload, isbn: second.isbn, version: 0 })).status, 409);
    assert.equal((await request(`/${second._id}`, 'PUT', { ...payload, version: second.__v, availableCopies: 99 })).status, 400);
  });
  await t.test('active loans block quantity reduction and archiving; increases preserve borrowed count', async () => {
    const stored = books.get(first._id); stored.availableCopies = 3;
    loans.push({ book: stored._id, returnedAt: null, status: 'borrowed' }, { book: stored._id, returnedAt: null, status: 'overdue' });
    assert.equal((await request(`/${first._id}`, 'PUT', { ...payload, totalCopies: 1, version: stored.__v })).status, 400);
    assert.equal((await request(`/${first._id}`, 'DELETE')).status, 409);
    const result = await request(`/${first._id}`, 'PUT', { ...payload, totalCopies: 6, version: stored.__v });
    assert.equal(result.status, 200); assert.equal(result.data.book.availableCopies, 4);
  });
  await t.test('inconsistent stock is rejected rather than silently repaired', async () => {
    const stored = books.get(first._id); stored.availableCopies = 0;
    assert.equal((await request(`/${first._id}`, 'PUT', { ...payload, totalCopies: 7, version: stored.__v })).status, 409);
    stored.availableCopies = 4;
  });
  await t.test('dashboard statistics are calculated from active inventory', async () => {
    const stats = (await request('/stats')).data.stats;
    assert.deepEqual(stats, { totalTitles: 2, totalCopies: 6, availableCopies: 4, borrowedCopies: 2 });
  });
  await t.test('archive preserves book and borrowing history and hides it from Students', async () => {
    const stored = books.get(first._id); stored.availableCopies = stored.totalCopies;
    loans.forEach(loan => { loan.returnedAt = new Date(); loan.status = 'returned'; });
    assert.equal((await request(`/${first._id}`, 'DELETE', undefined, 'librarian')).status, 200);
    assert.equal(books.has(first._id), true); assert.equal(loans.length, 2);
    assert.equal((await request(`/${first._id}`, 'GET', undefined, 'student')).status, 404);
    assert.equal((await request('?state=archived', 'GET', undefined, 'student')).data.total, 1);
    assert.equal((await request('?state=archived')).data.books[0]._id, first._id);
    assert.equal((await request('/stats')).data.stats.totalTitles, 1);
  });
  await t.test('missing and malformed book IDs return safe errors', async () => {
    assert.equal((await request('/invalid')).status, 400);
    assert.equal((await request(`/${new mongoose.Types.ObjectId()}`)).status, 404);
  });
});
