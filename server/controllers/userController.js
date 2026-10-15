const mongoose = require('mongoose');
const User = require('../models/User');
const { input } = require('../utils/accountInput');

exports.list = async (req, res) => {
  const filter = { role: req.user.role === 'librarian' ? 'student' : { $in: ['student', 'librarian'] } };
  res.json({ users: await User.find(filter).sort({ name: 1 }).limit(500) });
};
exports.create = async (req, res) => {
  const body = req.body || {};
  if (!['student', 'librarian'].includes(body.role) || (req.user.role === 'librarian' && body.role !== 'student')) {
    return res.status(403).json({ message: 'You cannot create this account role.' });
  }
  const data = await input(body, true, { student: body.role === 'student' });
  const user = await User.create({ ...data, role: body.role });
  res.status(201).json({ user: user.toJSON() });
};
exports.update = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
  const user = await User.findById(req.params.id).select('+tokenVersion');
  if (!user) return res.status(404).json({ message: 'Account not found.' });
  if (user.role === 'admin' || (req.user.role === 'librarian' && user.role !== 'student')) {
    return res.status(403).json({ message: 'You cannot manage this account.' });
  }
  const body = req.body || {};
  if (body.role !== undefined && body.role !== user.role) return res.status(403).json({ message: 'Account roles cannot be changed.' });
  const data = await input(body, false, { student: user.role === 'student', existing: user });
  Object.assign(user, data);
  // An atomic increment cannot overwrite a concurrent logout's revocation.
  if (data.password !== undefined || data.isActive !== undefined) user.$inc('tokenVersion', 1);
  await user.save();
  res.json({ user: user.toJSON() });
};
exports.input = input;
