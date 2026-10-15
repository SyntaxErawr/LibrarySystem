const mongoose = require('mongoose');
const text = (max, required = false) => ({ type: String, trim: true, maxlength: max, required });
const copies = { type: Number, required: true, min: 0, max: 1000000, validate: Number.isSafeInteger };
const schema = new mongoose.Schema({
  title: text(200, true), author: text(200, true), isbn: { ...text(13, true), unique: true },
  category: text(100, true), publisher: text(200), description: text(3000),
  shelfLocation: text(100), coverImageUrl: text(2000),
  publicationYear: { type: Number, min: 1, validate: Number.isSafeInteger },
  totalCopies: copies, availableCopies: copies, isActive: { type: Boolean, default: true },
}, { timestamps: true, optimisticConcurrency: true, toJSON: { virtuals: true } });
schema.index({ isActive: 1, category: 1, title: 1 });
schema.virtual('status').get(function () { return this.availableCopies > 0 ? 'Available' : 'Unavailable'; });
schema.pre('validate', async function () {
  const { bookErrors, normalizeIsbn } = await import('../../shared/bookValidation.mjs');
  this.isbn = normalizeIsbn(this.isbn);
  const errors = bookErrors(this.toObject(), { creating: this.isNew });
  for (const [field, message] of Object.entries(errors)) this.invalidate(field, message);
  if (this.availableCopies > this.totalCopies) this.invalidate('availableCopies', 'Availability cannot exceed total copies.');
});
module.exports = mongoose.model('Book', schema);
