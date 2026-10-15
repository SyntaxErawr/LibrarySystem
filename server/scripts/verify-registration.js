// Explicit opt-in live check: creates one temporary student and removes only it.
// Never logs credentials, tokens, hashes, connection strings or real user data.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { once } = require('node:events');
const { createApp } = require('../server');
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  let server;
  let createdId;
  const marker = randomBytes(12).toString('hex');
  const email = `registration-check-${marker}@example.test`;
  const studentId = `REG-CHECK-${marker}`;
  const password = `Aa1!${randomBytes(20).toString('hex')}`;
  try {
    await connectDB();
    // Read-only preflight: do not change existing duplicate records to build an index.
    const duplicates = await User.collection.aggregate([
      { $match: { role: 'student', studentId: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$studentId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $count: 'groups' },
    ]).toArray();
    assert.equal(duplicates.length, 0, 'Existing School IDs need review before unique indexing.');
    await User.init();
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (route, body, token) => {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await call('/health')).status, 200);
    const registration = { studentId: ` ${studentId} `, name: '  Temporary registration verification  ', email: ` ${email.toUpperCase()} `,
      course: 'Other', otherProgram: '  Test Program  ', yearLevel: '2nd Year', password, confirmPassword: password };
    const result = await call('/auth/register', registration);
    // Locate the exact test record even if a later assertion fails, for cleanup.
    const saved = await User.collection.findOne({ email, studentId });
    createdId = saved?._id;
    assert.equal(result.status, 201);
    assert.ok(saved);
    assert.equal(saved.role, 'student'); assert.equal(saved.name, 'Temporary registration verification');
    assert.equal(saved.course, 'Test Program'); assert.equal(saved.yearLevel, '2nd Year');
    assert.ok(saved.createdAt instanceof Date); assert.equal(saved.confirmPassword, undefined);
    assert.equal(await bcrypt.compare(password, saved.password), true);
    assert.equal(result.body.token, undefined);
    const duplicateEmail = await call('/auth/register', { ...registration, studentId: `${studentId}-other` });
    assert.equal(duplicateEmail.status, 409); assert.ok(duplicateEmail.body.fields.email);
    const duplicateId = await call('/auth/register', { ...registration, email: `other-${email}` });
    assert.equal(duplicateId.status, 409); assert.ok(duplicateId.body.fields.studentId);
    const signedIn = await call('/auth/login', { email, password });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.user.password, undefined);
    assert.equal((await call('/auth/me', undefined, signedIn.body.token)).status, 200);
    assert.equal((await call('/users', undefined, signedIn.body.token)).status, 403);
    assert.equal((await call('/auth/logout', {}, signedIn.body.token)).status, 200);
    assert.equal((await call('/auth/me', undefined, signedIn.body.token)).status, 401);
    console.log('PASS: Atlas registration persistence, bcrypt hash, unique email/School ID, student login, permissions and logout.');
  } catch (error) {
    console.error(JSON.stringify({ verification: 'failed', errorType: error.name, code: typeof error.code === 'number' ? error.code : undefined }));
    process.exitCode = 1;
  } finally {
    try {
      // Exact random identifiers restrict deletion to the account created above.
      const filter = { email, studentId, ...(createdId ? { _id: createdId } : {}) };
      if (mongoose.connection.readyState === 1) {
        await User.collection.deleteOne(filter);
        assert.equal(await User.collection.countDocuments({ email, studentId }), 0);
        console.log('Temporary verification account removed; existing user records unchanged.');
      }
    } catch {
      console.error('Temporary verification account cleanup failed. Rerun verification only after checking test records locally.');
      process.exitCode = 1;
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
})();
