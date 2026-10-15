const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret } = require('../middleware/authMiddleware');
const dummyHash = bcrypt.hashSync('timing-only-not-an-account-password', 12);

exports.register = async (req, res) => {
  const body = req.body || {};
  if (body.role !== undefined && body.role !== 'student') {
    return res.status(403).json({ message: 'Public registration is for students only.' });
  }
  const { input } = require('../utils/accountInput');
  const data = await input(body, true, { student: true, confirm: true });
  // Explicit fields prevent privileged attributes or confirmPassword being saved.
  await User.create({ name: data.name, email: data.email, studentId: data.studentId,
    course: data.course, yearLevel: data.yearLevel, password: data.password,
    role: 'student', isActive: true });
  res.status(201).json({ message: 'Student account created. You can now log in.' });
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  const { validEmail } = await import('../../shared/validation.mjs');
  if (!validEmail(email) || typeof password !== 'string' || !password.length || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ message: 'Enter a valid email and password.' });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password +tokenVersion');
  const matches = await bcrypt.compare(password, user?.password || dummyHash);
  if (!user || !matches || !user.isActive) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  const token = jwt.sign({ version: user.tokenVersion }, jwtSecret(), {
    subject: String(user._id), expiresIn: '2h', algorithm: 'HS256', issuer: 'library-api', audience: 'library-web',
  });
  res.json({ token, user: user.toJSON() });
};
exports.me = (req, res) => res.json({ user: req.user.toJSON() });
exports.logout = async (req, res) => {
  // Invalidate all previously issued tokens, including tokens in other tabs.
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ message: 'Logged out.' });
};
