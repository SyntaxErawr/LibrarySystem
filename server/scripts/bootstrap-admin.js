require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { input } = require('../controllers/userController');

async function bootstrapAdmin(body) {
  const data = await input(body, true);
  await User.init();
  if (await User.exists({ role: 'admin' })) {
    throw new Error('Admin setup is already complete. No account was changed.');
  }
  return User.create({ ...data, role: 'admin', isActive: true });
}

if (require.main === module) {
  (async () => {
    try {
      if (process.stdin.isTTY) throw new Error('Use npm run setup:admin for secure interactive setup.');
      let raw = '';
      for await (const chunk of process.stdin) {
        raw += chunk;
        if (raw.length > 4096) throw new Error('Invalid setup input.');
      }
      const body = JSON.parse(raw.replace(/^\uFEFF/, ''));
      await connectDB();
      await bootstrapAdmin(body);
      console.log('Initial Admin created. You can now log in with your chosen credentials.');
    } catch {
      console.error('Admin setup did not complete. Check password complexity (8+ characters with uppercase, lowercase, number and special character; max 72 UTF-8 bytes), Atlas access, and whether an Admin already exists. No credentials are logged.');
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}
module.exports = { bootstrapAdmin };
