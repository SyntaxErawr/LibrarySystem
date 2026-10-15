const mongoose = require('mongoose');
const Borrowing = require('../models/Borrowing');
const Book = require('../models/Book');
const User = require('../models/User');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const active = { returnedAt: null, status: { $in: ['borrowed', 'overdue'] } };
const open = { returnedAt: null, status: { $in: ['pending', 'borrowed', 'overdue'] } };
const populate = query => query.populate('student', 'name studentId').populate('book', 'title author isbn isActive').populate('issuedBy returnedBy reviewedBy', 'name');
async function present(loan) {
  const { loanStatus, daysRemaining } = await import('../../shared/borrowingDates.mjs');
  const value = typeof loan.toObject === 'function' ? loan.toObject() : loan;
  return { ...value, displayStatus: loanStatus(value), daysRemaining: daysRemaining(value) };
}
async function inTransaction(callback) {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => callback(session)); }
  finally { await session.endSession(); }
}
async function checkStock(book, session) {
  const count = await Borrowing.countDocuments({ book: book._id, ...active }).session(session);
  if (count !== book.totalCopies - book.availableCopies) fail(409, 'Inventory and active loans differ. Ask staff to review this book.');
}
async function issueCopy({ student, bookId, borrowedAt, dueDate, staff, requestId }, session) {
  const dates = await import('../../shared/borrowingDates.mjs');
  if (!dates.validDateKey(borrowedAt) || !dates.validDateKey(dueDate) || dueDate < borrowedAt || borrowedAt > dates.dateKey()) fail(400, 'Use valid dates. Borrow date cannot be in the future; due date cannot precede borrow date.');
  const borrower = await User.findOneAndUpdate({ _id: student, role: 'student', isActive: true }, { $inc: { circulationVersion: 1 } }, { session, returnDocument: 'after' });
  if (!borrower) fail(400, 'Only an active Student can borrow books.');
  const others = { student, ...open, ...(requestId ? { _id: { $ne: requestId } } : {}) };
  if (await Borrowing.countDocuments(others).session(session) >= 3) fail(409, 'This student already has 3 combined pending requests and active loans.');
  if (await Borrowing.exists({ ...others, book: bookId }).session(session)) fail(409, 'This student already has a pending request or active loan for this book. Approve pending requests from their request row.');
  const book = await Book.findById(bookId).session(session);
  if (!book || !book.isActive) fail(400, 'Choose an active book.');
  if (book.availableCopies < 1) fail(409, 'No copies are available. Pending requests do not reserve stock.');
  await checkStock(book, session);
  const updated = await Book.updateOne({ _id: book._id, isActive: true, availableCopies: { $gt: 0 }, __v: book.__v }, { $inc: { availableCopies: -1, __v: 1 } }, { session });
  if (updated.modifiedCount !== 1) fail(409, 'Book availability changed. Refresh and try again.');
  const issued = { issuedBy: staff, borrowedAt: dates.dayStart(borrowedAt), dueDate: dates.dayEnd(dueDate), status: 'borrowed' };
  if (requestId) {
    const result = await Borrowing.updateOne({ _id: requestId, status: 'pending' }, { $set: { ...issued, reviewedBy: staff, reviewedAt: new Date() }, $inc: { __v: 1 } }, { session });
    if (result.modifiedCount !== 1) fail(409, 'This request is no longer pending. Refresh the records.');
    return requestId;
  }
  const [loan] = await Borrowing.create([{ student, book: book._id, ...issued }], { session });
  return loan._id;
}
exports.issue = async (req, res) => {
  const { student, book: bookId, borrowedAt, dueDate } = req.body || {};
  if (![student, bookId].every(value => typeof value === 'string' && mongoose.isObjectIdOrHexString(value))) fail(400, 'Choose a valid Student and Book.');
  const id = await inTransaction(session => issueCopy({ student, bookId, borrowedAt, dueDate, staff: req.user._id }, session));
  res.status(201).json({ borrowing: await present(await populate(Borrowing.findById(id))), message: 'Book issued.' });
};
exports.requestBook = async (req, res) => {
  const bookId = req.body?.book;
  if (typeof bookId !== 'string' || !mongoose.isObjectIdOrHexString(bookId)) fail(400, 'Choose a valid book.');
  const student = req.user._id;
  const id = await inTransaction(async session => {
    const user = await User.findOneAndUpdate({ _id: student, role: 'student', isActive: true }, { $inc: { circulationVersion: 1 } }, { session, returnDocument: 'after' });
    if (!user) fail(400, 'Only an active Student can request books.');
    if (await Borrowing.countDocuments({ student, ...open }).session(session) >= 3) fail(409, 'You already have 3 combined pending requests and active loans.');
    if (await Borrowing.exists({ student, book: bookId, ...open }).session(session)) fail(409, 'You already have a pending request or active loan for this book.');
    const book = await Book.findById(bookId).session(session);
    if (!book || !book.isActive) fail(400, 'This book is not in the active catalog.');
    if (book.availableCopies < 1) fail(409, 'This book is currently unavailable.');
    const [request] = await Borrowing.create([{ student, book: book._id, status: 'pending', requestedAt: new Date() }], { session });
    return request._id;
  });
  res.status(201).json({ borrowing: await present(await populate(Borrowing.findById(id))), message: 'Request submitted. Wait for staff approval; copies are not reserved.' });
};
exports.catalogStatus = async (req, res) => {
  const raw = req.query.books;
  if (typeof raw !== 'string' || raw.length > 2500) fail(400, 'Invalid catalog selection.');
  const ids = [...new Set(raw.split(',').filter(Boolean))];
  if (ids.length > 100 || !ids.every(id => mongoose.isObjectIdOrHexString(id))) fail(400, 'Invalid catalog selection.');
  const requests = await Borrowing.aggregate([
    { $match: { student: req.user._id, book: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } } },
    { $addFields: { openFirst: { $cond: [{ $in: ['$status', ['pending', 'borrowed', 'overdue']] }, 1, 0] } } },
    { $sort: { openFirst: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: '$book', record: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$record' } },
    { $project: { _id: 1, book: 1, status: 1, requestedAt: 1, dueDate: 1, dueAt: 1, returnedAt: 1 } },
  ]);
  res.json({ requests: await Promise.all(requests.map(present)) });
};
async function pending(req, session, mine = false) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) fail(400, 'Invalid request ID.');
  const request = await Borrowing.findById(req.params.id).session(session);
  if (!request || mine && String(request.student) !== String(req.user._id)) fail(404, 'Request not found.');
  if (request.status !== 'pending') fail(409, 'Only pending requests can be changed.');
  return request;
}
exports.approve = async (req, res) => {
  const dates = await import('../../shared/borrowingDates.mjs');
  const borrowedAt = dates.dateKey();
  const dueDate = req.body?.dueDate ?? dates.addDays(borrowedAt, 7);
  const id = await inTransaction(async session => {
    const request = await pending(req, session);
    return issueCopy({ student: request.student, bookId: request.book, borrowedAt, dueDate, staff: req.user._id, requestId: request._id }, session);
  });
  res.json({ borrowing: await present(await populate(Borrowing.findById(id))), message: 'Request approved and book issued.' });
};
exports.reject = async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 300) fail(400, 'Enter a rejection reason from 1 to 300 characters.');
  await inTransaction(async session => {
    const request = await pending(req, session);
    await User.updateOne({ _id: request.student }, { $inc: { circulationVersion: 1 } }, { session });
    const result = await Borrowing.updateOne({ _id: request._id, status: 'pending' }, { $set: { status: 'rejected', rejectionReason: reason, reviewedBy: req.user._id, reviewedAt: new Date() }, $inc: { __v: 1 } }, { session });
    if (result.modifiedCount !== 1) fail(409, 'This request is no longer pending.');
  });
  res.json({ message: 'Request rejected. Stock is unchanged.' });
};
exports.cancel = async (req, res) => {
  await inTransaction(async session => {
    const request = await pending(req, session, true);
    await User.updateOne({ _id: req.user._id }, { $inc: { circulationVersion: 1 } }, { session });
    const result = await Borrowing.updateOne({ _id: request._id, student: req.user._id, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: new Date() }, $inc: { __v: 1 } }, { session });
    if (result.modifiedCount !== 1) fail(409, 'This request is no longer pending.');
  });
  res.json({ message: 'Request cancelled. Stock is unchanged.' });
};
exports.returnBook = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) fail(400, 'Invalid borrowing ID.');
  await inTransaction(async session => {
    const loan = await Borrowing.findById(req.params.id).session(session);
    if (!loan) fail(404, 'Borrowing record not found.');
    if (loan.returnedAt || !['borrowed', 'overdue'].includes(loan.status)) fail(409, 'Only an active issued loan can be returned.');
    // Use the same lock order as issue; return remains allowed for inactive Students.
    await User.updateOne({ _id: loan.student }, { $inc: { circulationVersion: 1 } }, { session });
    const book = await Book.findById(loan.book).session(session);
    if (!book) fail(409, 'The referenced book is missing. Ask staff to review this record.');
    await checkStock(book, session);
    if (book.availableCopies >= book.totalCopies) fail(409, 'Inventory cannot accept another returned copy.');
    const changed = await Borrowing.updateOne({ _id: loan._id, ...active }, { $set: { returnedAt: new Date(), returnedBy: req.user._id, status: 'returned' }, $inc: { __v: 1 } }, { session });
    if (changed.modifiedCount !== 1) fail(409, 'This book has already been returned.');
    const stock = await Book.updateOne({ _id: book._id, __v: book.__v, availableCopies: { $lt: book.totalCopies } }, { $inc: { availableCopies: 1, __v: 1 } }, { session });
    if (stock.modifiedCount !== 1) fail(409, 'Book availability changed. Refresh and try again.');
  });
  res.json({ message: 'Book returned. Borrowing history is preserved.' });
};
async function scope(req, mine = false) {
  const dates = await import('../../shared/borrowingDates.mjs');
  const { status = '', search = '' } = req.query;
  if (typeof status !== 'string' || !['', 'active', 'borrowed', 'overdue', 'returned', 'pending', 'rejected', 'cancelled', 'history', 'open'].includes(status) || typeof search !== 'string' || search.length > 120) fail(400, 'Invalid borrowing filters.');
  const filter = mine || req.user.role === 'student' ? { student: req.user._id } : {};
  const day = dates.dayStart(dates.dateKey());
  const due = { $ifNull: ['$dueDate', '$dueAt'] };
  if (['pending', 'rejected', 'cancelled'].includes(status)) filter.status = status;
  else if (status === 'history') filter.status = { $in: ['returned', 'rejected', 'cancelled'] };
  else if (status === 'open') Object.assign(filter, open);
  else if (status === 'returned') filter.$or = [{ returnedAt: { $ne: null } }, { status: 'returned' }];
  else if (status) {
    Object.assign(filter, active);
    if (status === 'overdue') filter.$expr = { $and: [{ $ne: [due, null] }, { $lt: [due, day] }] };
    if (status === 'borrowed') filter.$expr = { $or: [{ $eq: [due, null] }, { $gte: [due, day] }] };
  }
  if (search.trim()) {
    const regex = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [students, books] = await Promise.all([
      User.find({ role: 'student', $or: [{ name: regex }, { studentId: regex }] }).select('_id').lean(),
      Book.find({ $or: [{ title: regex }, { isbn: { $regex: search.replace(/[\s-]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] }).select('_id').lean(),
    ]);
    filter.$and = [{ $or: [{ student: { $in: students.map(user => user._id) } }, { book: { $in: books.map(book => book._id) } }] }];
  }
  return filter;
}
exports.list = async (req, res) => {
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'Invalid borrowing page.');
  const filter = await scope(req, req.path === '/my');
  const [records, total] = await Promise.all([populate(Borrowing.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)), Borrowing.countDocuments(filter)]);
  res.json({ borrowings: await Promise.all(records.map(present)), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
};
exports.summary = async (req, res) => {
  const dates = await import('../../shared/borrowingDates.mjs');
  const mine = req.user.role === 'student';
  const base = mine ? { student: req.user._id } : {};
  const overdue = await scope({ ...req, query: { status: 'overdue' } }, mine);
  const [current, late, recent, upcoming, pendingCount] = await Promise.all([
    Borrowing.countDocuments({ ...base, ...active }), Borrowing.countDocuments(overdue),
    populate(Borrowing.find(base).sort({ createdAt: -1, _id: -1 }).limit(5)),
    populate(Borrowing.find({ ...base, ...active, $expr: { $gte: [{ $ifNull: ['$dueDate', '$dueAt'] }, dates.dayStart(dates.dateKey())] } }).sort({ dueDate: 1, _id: 1 }).limit(5)),
    Borrowing.countDocuments({ ...base, status: 'pending' }),
  ]);
  res.json({ activeCount: current, overdueCount: late, pendingCount, recent: await Promise.all(recent.map(present)), upcoming: await Promise.all(upcoming.map(present)) });
};
exports.students = async (req, res) => {
  const search = req.query.search || '';
  if (typeof search !== 'string' || search.length > 120) fail(400, 'Invalid student search.');
  const regex = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const students = await User.find({ role: 'student', isActive: true, $or: [{ name: regex }, { studentId: regex }] }).select('name studentId').sort({ name: 1 }).limit(50);
  res.json({ students });
};
