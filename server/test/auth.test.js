const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createApp } = require('../server');
const User = require('../models/User');
const { bootstrapAdmin } = require('../scripts/bootstrap-admin');

// Only the persistence boundary is replaced. Real HTTP routes, model validation,
// bcrypt hashing, JWT verification and authorization execute without Atlas writes.
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const records = new Map();
const query = value => ({ select: async () => value });
User.findOne = filter => query([...records.values()].find(user => user.email === filter.email));
User.findById = id => query(records.get(String(id)));
User.find = filter => ({ sort: () => ({ limit: async () => [...records.values()].filter(user => typeof filter.role === 'string' ? user.role === filter.role : filter.role.$in.includes(user.role)) }) });
User.updateOne = async (filter, update) => {
  const user = records.get(String(filter._id));
  user.tokenVersion += update.$inc.tokenVersion;
};
User.collection.insertOne = async document => {
  const existing = [...records.values()];
  const field = existing.some(user => user.email === document.email) ? 'email'
    : document.role === 'student' && existing.some(user => user.role === 'student' && user.studentId === document.studentId) ? 'studentId'
      : document.role === 'admin' && existing.some(user => user.role === 'admin') ? 'role' : null;
  if (field) throw Object.assign(new Error('Duplicate'), { code: 11000, keyPattern: { [field]: 1 } });
  records.set(String(document._id), User.hydrate(document));
  return { acknowledged: true, insertedId: document._id };
};
let lastUserWrite;
User.collection.updateOne = async (filter, update) => { lastUserWrite = update; return { acknowledged: true, matchedCount: 1 }; };
User.init = async () => User;
User.exists = async filter => [...records.values()].some(user => user.role === filter.role);

const server = createApp().listen(0, '127.0.0.1');
const ready = once(server, 'listening');
after(() => new Promise(resolve => server.close(resolve)));
async function request(path, method = 'GET', body, token) {
  await ready;
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
const password = 'Aa1!' + randomBytes(20).toString('hex');
const studentFields = { studentId: 'TEST-001', course: 'BSIT', yearLevel: '1st Year' };
const login = email => request('/auth/login', 'POST', { email, password });

test('authentication and account permission scenarios', async t => {
  let admin, librarian, student;
  await t.test('one-time Admin bootstrap hashes password and refuses a second Admin', async () => {
    admin = await bootstrapAdmin({ name: 'Test Admin', email: 'admin@example.test', password });
    assert.notEqual(admin.password, password);
    assert.equal(await bcrypt.compare(password, admin.password), true);
    assert.equal(admin.toJSON().password, undefined);
    await assert.rejects(bootstrapAdmin({ name: 'Other Admin', email: 'other@example.test', password }), /already complete/);
  });
  let adminToken, librarianToken, studentToken;
  await t.test('valid login returns a token and excludes secrets', async () => {
    const response = await login(' ADMIN@example.test ');
    assert.equal(response.status, 200);
    adminToken = response.data.token;
    assert.equal(response.data.user.password, undefined);
    assert.equal(response.data.user.tokenVersion, undefined);
    assert.equal(jwt.verify(adminToken, process.env.JWT_SECRET).sub, String(admin._id));
  });
  await t.test('wrong password, unknown email and malformed input are rejected', async () => {
    const wrong = await request('/auth/login', 'POST', { email: admin.email, password: 'wrong-password' });
    const missing = await login('unknown@example.test');
    assert.equal(wrong.status, 401); assert.equal(missing.status, 401);
    assert.deepEqual(wrong.data, missing.data);
    assert.equal((await request('/auth/login', 'POST', { email: { $ne: null }, password })).status, 400);
  });
  await t.test('protected endpoints reject missing, forged and expired tokens', async () => {
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/me', 'GET', undefined, 'forged')).status, 401);
    const expired = jwt.sign({ version: 0 }, process.env.JWT_SECRET, { subject: String(admin._id), expiresIn: -1, issuer: 'library-api', audience: 'library-web' });
    assert.equal((await request('/auth/me', 'GET', undefined, expired)).status, 401);
  });
  await t.test('Admin creates Librarian and Student but cannot create another Admin', async () => {
    const lib = await request('/users', 'POST', { name: 'Test Librarian', email: 'librarian@example.test', password, role: 'librarian' }, adminToken);
    const stu = await request('/users', 'POST', { name: 'Test Student', email: 'student@example.test', password, role: 'student', ...studentFields }, adminToken);
    assert.equal(lib.status, 201); assert.equal(stu.status, 201);
    librarian = records.get(lib.data.user._id); student = records.get(stu.data.user._id);
    assert.equal((await request('/users', 'POST', { name: 'Admin', email: 'new@example.test', password, role: 'admin' }, adminToken)).status, 403);
    librarianToken = (await login(librarian.email)).data.token;
    studentToken = (await login(student.email)).data.token;
  });
  await t.test('all three roles can access their own profile', async () => {
    for (const [token, role] of [[adminToken, 'admin'], [librarianToken, 'librarian'], [studentToken, 'student']]) {
      const response = await request('/auth/me', 'GET', undefined, token);
      assert.equal(response.status, 200); assert.equal(response.data.user.role, role);
    }
  });
  await t.test('Librarian lists only students and can create and edit them', async () => {
    const created = await request('/users', 'POST', { name: 'Another Student', email: 'another@example.test', password, role: 'student', tokenVersion: 999, ...studentFields, studentId: 'TEST-002' }, librarianToken);
    assert.equal(created.status, 201);
    assert.equal(records.get(created.data.user._id).tokenVersion, 0);
    const list = await request('/users', 'GET', undefined, librarianToken);
    assert.equal(list.status, 200); assert.ok(list.data.users.every(user => user.role === 'student'));
    const edited = await request(`/users/${student._id}`, 'PUT', { name: 'Updated Student', course: 'Other', otherProgram: 'Computing' }, librarianToken);
    assert.equal(edited.status, 200); assert.equal(edited.data.user.name, 'Updated Student');
  });
  await t.test('Librarian cannot manage staff or promote a student', async () => {
    assert.equal((await request('/users', 'POST', { name: 'Staff', email: 'staff@example.test', password, role: 'librarian' }, librarianToken)).status, 403);
    for (const target of [admin, librarian]) assert.equal((await request(`/users/${target._id}`, 'PUT', { name: 'Changed' }, librarianToken)).status, 403);
    assert.equal((await request(`/users/${student._id}`, 'PUT', { role: 'admin' }, librarianToken)).status, 403);
  });
  await t.test('Student cannot list, create or edit accounts', async () => {
    assert.equal((await request('/users', 'GET', undefined, studentToken)).status, 403);
    assert.equal((await request('/users', 'POST', {}, studentToken)).status, 403);
    assert.equal((await request(`/users/${student._id}`, 'PUT', { name: 'Changed' }, studentToken)).status, 403);
  });
  await t.test('validation rejects short passwords, invalid emails, IDs and duplicate emails', async () => {
    const body = { name: 'New User', email: 'new@example.test', password, role: 'student', ...studentFields, studentId: 'TEST-003' };
    assert.equal((await request('/users', 'POST', { ...body, password: 'short' }, adminToken)).status, 400);
    assert.equal((await request('/users', 'POST', { ...body, email: 'invalid' }, adminToken)).status, 400);
    assert.equal((await request('/users', 'POST', { ...body, email: student.email }, adminToken)).status, 409);
    assert.equal((await request('/users/not-an-id', 'PUT', {}, adminToken)).status, 400);
  });
  await t.test('deactivation blocks login and invalidates an existing session', async () => {
    assert.equal((await request(`/users/${student._id}`, 'PUT', { isActive: false }, librarianToken)).status, 200);
    assert.equal((await login(student.email)).status, 401);
    assert.equal((await request('/auth/me', 'GET', undefined, studentToken)).status, 401);
    assert.equal((await request(`/users/${student._id}`, 'PUT', { isActive: true }, librarianToken)).status, 200);
    assert.equal((await request('/auth/me', 'GET', undefined, studentToken)).status, 401);
  });
  await t.test('Admin resets staff password and previous tokens stop working', async () => {
    const replacement = 'Aa1!' + randomBytes(20).toString('hex');
    assert.equal((await request(`/users/${librarian._id}`, 'PUT', { password: replacement }, adminToken)).status, 200);
    assert.equal(lastUserWrite.$inc.tokenVersion, 1);
    assert.equal(lastUserWrite.$set?.tokenVersion, undefined);
    assert.equal(await bcrypt.compare(replacement, librarian.password), true);
    assert.equal((await request('/auth/me', 'GET', undefined, librarianToken)).status, 401);
  });
  await t.test('logout revokes the token on the server', async () => {
    assert.equal((await request('/auth/logout', 'POST', {}, adminToken)).status, 200);
    assert.equal((await request('/auth/me', 'GET', undefined, adminToken)).status, 401);
  });
  await t.test('schema restricts roles and has database unique indexes', async () => {
    const invalid = new User({ name: 'Bad', email: 'bad@example.test', role: 'owner', password });
    await assert.rejects(invalid.validate(), /role/);
    const indexes = User.schema.indexes();
    assert.ok(indexes.some(([keys, options]) => keys.email === 1 && options.unique));
    assert.ok(indexes.some(([keys, options]) => keys.role === 1 && options.unique && options.partialFilterExpression.role === 'admin'));
    assert.equal(mongoose.connection.readyState, 0);
  });
  const registration = { name: 'New Student', email: 'registration@example.test', ...studentFields, studentId: 'REGISTER-001', password, confirmPassword: password };
  const register = body => request('/auth/register', 'POST', body);
  await t.test('registration rejects an empty form and missing required fields', async t => {
    assert.equal((await register({})).status, 400);
    for (const field of ['studentId', 'name', 'email', 'course', 'yearLevel', 'password', 'confirmPassword']) {
      await t.test(`missing ${field}`, async () => {
        const response = await register({ ...registration, [field]: '' });
        assert.equal(response.status, 400); assert.ok(response.data.fields[field]);
      });
    }
    for (const field of ['studentId', 'name']) assert.equal((await register({ ...registration, [field]: '   ' })).status, 400);
  });
  await t.test('registration validates program, year level, email and field types', async () => {
    for (const patch of [
      { email: 'studentgmail.com' }, { course: 'Other', otherProgram: '   ' },
      { course: 'Unlisted' }, { yearLevel: '5th Year' }, { studentId: { $ne: '' } },
    ]) assert.equal((await register({ ...registration, ...patch })).status, 400);
  });
  await t.test('registration enforces every password rule and exact confirmation', async t => {
    for (const [name, value] of Object.entries({ short: 'Aa1!', uppercase: 'library@123', lowercase: 'LIBRARY@123', number: 'Library@abc', special: 'Library123', whitespace: '        ', tooLong: 'Aa1!' + 'x'.repeat(69) })) {
      await t.test(name, async () => {
        const response = await register({ ...registration, password: value, confirmPassword: value });
        assert.equal(response.status, 400); assert.ok(response.data.fields.password);
      });
    }
    const response = await register({ ...registration, confirmPassword: password + 'x' });
    assert.equal(response.status, 400); assert.ok(response.data.fields.confirmPassword);
  });
  await t.test('public registration refuses privileged roles', async () => {
    for (const role of ['admin', 'librarian']) assert.equal((await register({ ...registration, role })).status, 403);
  });
  await t.test('registration normalizes data, hashes password and does not auto-login', async () => {
    const response = await register({ ...registration, name: '  New Student  ', email: ' REGISTRATION@EXAMPLE.TEST ', studentId: ' REGISTER-001 ', tokenVersion: 999, isActive: false });
    assert.equal(response.status, 201); assert.equal(response.data.token, undefined);
    const saved = [...records.values()].find(user => user.email === registration.email);
    assert.equal(saved.name, registration.name); assert.equal(saved.studentId, registration.studentId);
    assert.equal(saved.course, 'BSIT'); assert.equal(saved.yearLevel, '1st Year');
    assert.equal(saved.role, 'student'); assert.equal(saved.isActive, true); assert.equal(saved.tokenVersion, 0);
    assert.equal(saved.toObject().confirmPassword, undefined);
    assert.equal(await bcrypt.compare(password, saved.password), true);
    assert.equal(saved.toJSON().password, undefined);
    const loggedIn = await login(registration.email);
    assert.equal(loggedIn.status, 200);
    assert.equal((await request('/users', 'GET', undefined, loggedIn.data.token)).status, 403);
  });
  await t.test('duplicate email and School ID return clear field errors', async () => {
    const email = await register({ ...registration, studentId: 'REGISTER-002' });
    assert.equal(email.status, 409); assert.ok(email.data.fields.email);
    const schoolId = await register({ ...registration, email: 'different@example.test' });
    assert.equal(schoolId.status, 409); assert.ok(schoolId.data.fields.studentId);
  });
  await t.test('Other program text is trimmed and saved', async () => {
    assert.equal((await register({ ...registration, email: 'other-program@example.test', studentId: 'REGISTER-OTHER', course: 'Other', otherProgram: '  Fine Arts  ' })).status, 201);
    const saved = [...records.values()].find(user => user.email === 'other-program@example.test');
    assert.equal(saved.course, 'Fine Arts');
  });
  await t.test('staff creation uses student field and password rules', async () => {
    adminToken = (await login(admin.email)).data.token;
    const invalid = await request('/users', 'POST', { name: 'Missing Details', email: 'staff-create@example.test', role: 'student', password }, adminToken);
    assert.equal(invalid.status, 400); assert.ok(invalid.data.fields.studentId);
    const weak = await request('/users', 'POST', { ...registration, role: 'student', password: 'alllowercase123' }, adminToken);
    assert.equal(weak.status, 400); assert.ok(weak.data.fields.password);
  });
  await t.test('legacy passwords still authenticate without new complexity checks', async () => {
    const legacyPassword = randomBytes(16).toString('hex');
    const legacy = User.hydrate({ _id: new mongoose.Types.ObjectId(), name: 'Legacy Staff', email: 'legacy@example.test', role: 'librarian', password: await bcrypt.hash(legacyPassword, 12), isActive: true, tokenVersion: 0 });
    records.set(String(legacy._id), legacy);
    assert.equal((await request('/auth/login', 'POST', { email: legacy.email, password: legacyPassword })).status, 200);
    const legacyStudent = User.hydrate({ _id: new mongoose.Types.ObjectId(), name: 'Legacy Student', email: 'legacy-student@example.test', role: 'student', password: legacy.password, isActive: true, tokenVersion: 0 });
    records.set(String(legacyStudent._id), legacyStudent);
    assert.equal((await request(`/users/${legacyStudent._id}`, 'PUT', { isActive: false }, adminToken)).status, 200);
  });
  await t.test('database errors return safe, helpful registration errors', async () => {
    const original = User.collection.insertOne;
    User.collection.insertOne = async () => { throw Object.assign(new Error('Private connection details'), { name: 'MongoNetworkError' }); };
    try {
      const response = await register({ ...registration, studentId: 'DATABASE-FAIL', email: 'db-fail@example.test' });
      assert.equal(response.status, 503); assert.ok(!JSON.stringify(response.data).includes('Private'));
    } finally { User.collection.insertOne = original; }
  });
  await t.test('repeated registration attempts are rate limited', async () => {
    let response;
    for (let attempt = 0; attempt < 41; attempt++) response = await register({});
    assert.equal(response.status, 429);
  });
  await t.test('repeated login attempts are rate limited', async () => {
    let response;
    for (let attempt = 0; attempt < 21; attempt++) response = await request('/auth/login', 'POST', {});
    assert.equal(response.status, 429);
  });
});
