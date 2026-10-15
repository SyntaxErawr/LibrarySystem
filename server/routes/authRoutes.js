const router = require('express').Router();
const { login, me, logout, register } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const rateLimit = require('../middleware/rateLimit');

// Small, bounded in-memory limit for this single-process local backend.
router.post('/login', rateLimit(20, 'Too many login attempts. Try again in 15 minutes.'), login);
router.post('/register', rateLimit(40, 'Too many registration attempts. Try again in 15 minutes.'), register);
router.get('/me', protect, me);
router.post('/logout', protect, logout);
module.exports = router;
