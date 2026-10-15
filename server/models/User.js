const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxlength: 254 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'librarian', 'student'], required: true },
  isActive: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0, select: false },
  circulationVersion: { type: Number, default: 0, select: false },
  studentId: { type: String, trim: true, maxlength: 50, required: studentFieldRequired },
  course: { type: String, trim: true, maxlength: 100, required: studentFieldRequired },
  yearLevel: { type: String, trim: true, enum: ['1st Year', '2nd Year', '3rd Year', '4th Year'], required: studentFieldRequired },
  section: { type: String, trim: true, maxlength: 50 },
}, { timestamps: true });

// A database-enforced singleton also prevents concurrent bootstrap attempts.
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } });
// Legacy accounts without a School ID remain valid and outside this index.
userSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { role: 'student', studentId: { $type: 'string', $gt: '' } } });
function studentFieldRequired() { return this.role === 'student' && this.isNew; }
userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    const { validPassword } = await import('../../shared/validation.mjs');
    if (!validPassword(this.password)) {
      throw Object.assign(new Error('Password must meet all complexity requirements and be at most 72 UTF-8 bytes.'), { status: 400 });
    }
    this.password = await bcrypt.hash(this.password, 12);
  }
});
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.tokenVersion;
  delete user.circulationVersion;
  delete user.__v;
  return user;
};
module.exports = mongoose.model('User', userSchema);
