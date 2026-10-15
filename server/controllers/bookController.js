const mongoose = require('mongoose');
const Book = require('../models/Book');
const fail = (status, message, fields) => { throw Object.assign(new Error(message), { status, fields }); };
const idValid = id => mongoose.isObjectIdOrHexString(id);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function input(body, creating) {
  const { bookErrors, BOOK_TEXT_FIELDS, normalizeIsbn } = await import('../../shared/bookValidation.mjs');
  if (body.availableCopies !== undefined || body.isActive !== undefined) fail(400, 'Availability and archive status are managed by the server.');
  const errors = bookErrors(body, { creating });
  if (Object.keys(errors).length) fail(400, 'Please check the book fields.', errors);
  const data = { isbn: normalizeIsbn(body.isbn), totalCopies: Number(body.totalCopies) };
  for (const field of Object.keys(BOOK_TEXT_FIELDS)) data[field] = body[field]?.trim() || '';
  data.publicationYear = body.publicationYear === '' || body.publicationYear == null ? undefined : Number(body.publicationYear);
  return data;
}
function filters(req) {
  const { search = '', category = '', availability = '', state = 'active' } = req.query;
  if ([search, category, availability, state].some(value => typeof value !== 'string') || search.length > 120 || category.length > 100 || !['', 'available', 'unavailable'].includes(availability) || !['active', 'archived'].includes(state)) fail(400, 'Invalid catalog filters.');
  const base = { isActive: req.user.role === 'student' || state !== 'archived' };
  const filter = { ...base };
  if (search.trim()) filter.$or = ['title', 'author', 'isbn'].map(field => ({ [field]: { $regex: escapeRegex(field === 'isbn' ? search.replace(/[\s-]/g, '') : search.trim()), $options: 'i' } }));
  if (category) filter.category = category;
  if (availability) filter.availableCopies = availability === 'available' ? { $gt: 0 } : 0;
  return { base, filter };
}
exports.list = async (req, res) => {
  const { base, filter } = filters(req);
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'Invalid catalog page.');
  const [books, total, categories] = await Promise.all([
    Book.find(filter).sort({ title: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter), Book.distinct('category', base),
  ]);
  res.json({ books, total, page, pages: Math.max(1, Math.ceil(total / limit)), categories: categories.sort() });
};
exports.details = async (req, res) => {
  if (!idValid(req.params.id)) fail(400, 'Invalid book ID.');
  const book = await Book.findById(req.params.id);
  if (!book || req.user.role === 'student' && !book.isActive) fail(404, 'Book not found.');
  res.json({ book });
};
exports.create = async (req, res) => {
  const data = await input(req.body || {}, true);
  const book = await Book.create({ ...data, availableCopies: data.totalCopies });
  res.status(201).json({ book, message: 'Book added.' });
};
// Raw collection reads preserve compatibility with the future Borrowing model.
// All loan writes in that milestone must update this same book in a transaction.
async function activeLoans(bookId, session) {
  return mongoose.connection.collection('borrowings').countDocuments({ book: bookId, returnedAt: null, status: { $in: ['borrowed', 'overdue'] } }, { session });
}
exports.update = async (req, res) => {
  if (!idValid(req.params.id)) fail(400, 'Invalid book ID.');
  const data = await input(req.body || {}, false);
  if (!Number.isSafeInteger(req.body.version) || req.body.version < 0) fail(400, 'Reload the book before editing.');
  let result;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const book = await Book.findById(req.params.id).session(session);
      if (!book || !book.isActive) fail(404, 'Active book not found.');
      if (book.__v !== req.body.version) fail(409, 'This book changed. Reload it before saving.');
      const borrowed = await activeLoans(book._id, session);
      if (borrowed !== book.totalCopies - book.availableCopies) fail(409, 'Inventory and active loans differ. Review this book before changing stock.');
      if (data.totalCopies < borrowed) fail(400, 'Total copies cannot be smaller than the number currently borrowed.', { totalCopies: `At least ${borrowed} copies are currently borrowed.` });
      Object.assign(book, data, { availableCopies: data.totalCopies - borrowed });
      result = await book.save({ session });
    });
  } finally { await session.endSession(); }
  res.json({ book: result, message: 'Book updated.' });
};
exports.archive = async (req, res) => {
  if (!idValid(req.params.id)) fail(400, 'Invalid book ID.');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const book = await Book.findById(req.params.id).session(session);
      if (!book || !book.isActive) fail(404, 'Active book not found.');
      if (await activeLoans(book._id, session) || book.availableCopies !== book.totalCopies) fail(409, 'Return all borrowed copies before archiving this book.');
      book.isActive = false;
      await book.save({ session });
    });
  } finally { await session.endSession(); }
  res.json({ message: 'Book archived. Borrowing history is preserved.' });
};
exports.stats = async (req, res) => {
  const [stats] = await Book.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: null, totalTitles: { $sum: 1 }, totalCopies: { $sum: '$totalCopies' }, availableCopies: { $sum: '$availableCopies' }, borrowedCopies: { $sum: { $subtract: ['$totalCopies', '$availableCopies'] } } } },
    { $project: { _id: 0 } },
  ]);
  res.json({ stats: stats || { totalTitles: 0, totalCopies: 0, availableCopies: 0, borrowedCopies: 0 } });
};
