const mongoose = require('mongoose');
const reference = model => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true });
const schema = new mongoose.Schema({
  student: reference('User'), book: reference('Book'), issuedBy: { ...reference('User'), required: issuedRequired },
  borrowedAt: { type: Date, required: issuedRequired },
  dueDate: { type: Date, required: function () { return this.isNew && issuedRequired.call(this); } },
  requestedAt: { type: Date, required: function () { return this.status === 'pending'; } }, reviewedAt: Date, cancelledAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, trim: true, maxlength: 300 },
  dueAt: Date, // Read compatibility for older records; new issues use dueDate.
  returnedAt: { type: Date, default: null },
  returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['pending', 'rejected', 'cancelled', 'borrowed', 'returned'], default: 'borrowed', required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ student: 1, book: 1 }, { unique: true, partialFilterExpression: { status: 'borrowed', returnedAt: null } });
schema.index({ student: 1, book: 1 }, { name: 'unique_pending_request', unique: true, partialFilterExpression: { status: 'pending' } });
function issuedRequired() { return ['borrowed', 'returned'].includes(this.status); }
schema.index({ book: 1, returnedAt: 1, status: 1 });
schema.index({ student: 1, returnedAt: 1, dueDate: 1 });
schema.index({ returnedAt: 1, dueDate: 1 });
schema.pre('validate', function () {
  if (this.dueDate && this.borrowedAt && this.dueDate < this.borrowedAt) this.invalidate('dueDate', 'Due date must not precede the borrow date.');
});
module.exports = mongoose.model('Borrowing', schema);
