const jwt = require('jsonwebtoken');
const User = require('../models/User');

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || /<|>/.test(secret)) {
    throw new Error('Configure a JWT secret of at least 32 characters.');
  }
  return secret;
}

async function protect(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return res.status(401).json({ message: 'Please log in.' });
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'], issuer: 'library-api', audience: 'library-web' });
  } catch {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  if (typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub)) {
    return res.status(401).json({ message: 'Invalid session.' });
  }
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.isActive || user.tokenVersion !== payload.version) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  req.user = user;
  next();
}
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have access to this action.' });
  next();
};
module.exports = { protect, authorize, jwtSecret };
