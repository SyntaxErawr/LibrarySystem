// Dependency-free browser checks using installed Chrome and its DevTools protocol.
// API responses are intercepted fixtures; no real accounts or Atlas records are used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { preview } from 'vite';
import { dateKey, addDays, dayStart, dayEnd, loanStatus, daysRemaining } from '../shared/borrowingDates.mjs';

const profilePrefix = path.join(tmpdir(), 'library-browser-');
const profile = await mkdtemp(profilePrefix);
const web = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true, open: false } });
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
let nextId = 0;
const pending = new Map();
const exceptions = [];
let eventFailure;
let registrationFailure;
const password = `Aa1!${randomBytes(12).toString('hex')}`;
const fixtures = ['admin', 'librarian', 'student'].map((role, i) => ({ _id: String(i + 1).padStart(24, '0'), name: `Browser ${role}`, email: `${role}@browser.test`, role, isActive: true, studentId: 'BROWSER-001', course: 'BSIT', yearLevel: '1st Year' }));
const sessions = new Map();
const catalog = [{ _id: '000000000000000000000011', title: 'The C Programming Language', author: 'Kernighan and Ritchie', isbn: '9780131103627', category: 'Programming', totalCopies: 3, availableCopies: 3, isActive: true, __v: 0 }];
let archiveRequests = 0;
const browserLoans = [];
let returnRequests = 0;
const loanView = loan => ({ ...loan, student: fixtures.find(user => user._id === loan.student), book: catalog.find(book => book._id === loan.book), issuedBy: fixtures.find(user => user._id === loan.issuedBy), returnedBy: fixtures.find(user => user._id === loan.returnedBy), displayStatus: loanStatus(loan), daysRemaining: daysRemaining(loan) });
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  if (eventFailure) throw eventFailure;
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error('Browser script failed.');
  return result.result.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.error(JSON.stringify({ browserCheck: 'condition-timeout', archiveRequests, view: await evaluate(`({ path: location.pathname, error: document.querySelector('[role="alert"]')?.textContent, message: document.querySelector('.success')?.textContent, rows: document.querySelectorAll('tbody tr').length })`) }));
  throw new Error(`Browser condition failed: ${expression}`);
}
async function fill(name, value) {
  await evaluate(`(() => { const input = document.querySelector('dialog[open] [name="${name}"]') || document.querySelector('[name="${name}"]'); const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await new Promise(resolve => setTimeout(resolve, 30));
}
async function choose(name, value) {
  await evaluate(`(() => { const select = document.querySelector('dialog select[name="${name}"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
const submit = () => evaluate(`document.querySelector('form button:not([type="button"])').click()`);
async function navigate(route) {
  await send('Page.navigate', { url: `http://127.0.0.1:4173${route}` });
  await waitFor(`document.querySelector('form') !== null || document.querySelector('.content') !== null`);
}
async function intercept(event) {
  const request = event.request;
  const route = new URL(request.url).pathname.replace('/api', '');
  let status = 200;
  let body;
  const input = request.postData ? JSON.parse(request.postData) : {};
  const auth = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
  const user = sessions.get(auth?.replace('Bearer ', ''));
  if (request.method === 'OPTIONS') body = {};
  else if (route === '/auth/register') {
    if (registrationFailure === 'network') {
      await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' });
      return;
    }
    if (registrationFailure === 'duplicate') {
      status = 409; body = { message: 'This School ID is already registered.', fields: { studentId: 'This School ID is already registered.' } };
    } else { status = 201; body = { message: 'Student account created. You can now log in.' }; }
  }
  else if (route === '/auth/login') {
    const account = fixtures.find(item => item.email === input.email.trim().toLowerCase());
    if (!account) { status = 401; body = { message: 'Invalid email or password.' }; }
    else { const token = randomBytes(20).toString('hex'); sessions.set(token, account); body = { user: account, token }; }
  } else if (!user) { status = 401; body = { message: 'Please log in.' }; }
  else if (route === '/auth/me') body = { user };
  else if (route === '/auth/logout') { sessions.delete(auth.replace('Bearer ', '')); body = { message: 'Logged out.' }; }
  else if (route === '/users') body = { users: fixtures.filter(item => item.role === 'student') };
  else if (route === '/borrowings/students') body = { students: fixtures.filter(item => item.role === 'student') };
  else if (route === '/borrowings/requests/status') {
    const ids = new URL(request.url).searchParams.get('books').split(',');
    const records = browserLoans.filter(loan => loan.student === user._id && ids.includes(loan.book));
    body = { requests: [...new Map(records.map(loan => [loan.book, { ...loan, displayStatus: loanStatus(loan) }])).values()] };
  } else if (route === '/borrowings/requests') {
    const loan = { _id: String(100 + browserLoans.length).padStart(24, '0'), student: user._id, book: input.book, status: 'pending', requestedAt: new Date() };
    browserLoans.push(loan); status = 201; body = { borrowing: loanView(loan), message: 'Request submitted. Wait for staff approval; copies are not reserved.' };
  } else if (/^\/borrowings\/[^/]+\/(approve|reject|cancel)$/.test(route)) {
    const record = browserLoans.find(loan => loan._id === route.split('/')[2]);
    const action = route.split('/')[3];
    if (action === 'approve') { record.status = 'borrowed'; record.borrowedAt = dayStart(dateKey()); record.dueDate = dayEnd(input.dueDate || addDays(dateKey(), 7)); record.issuedBy = user._id; catalog.find(book => book._id === record.book).availableCopies--; }
    if (action === 'reject') { record.status = 'rejected'; record.rejectionReason = input.reason.trim(); record.reviewedAt = new Date(); }
    if (action === 'cancel') { record.status = 'cancelled'; record.cancelledAt = new Date(); }
    body = { message: action === 'approve' ? 'Request approved and book issued.' : action === 'reject' ? 'Request rejected. Stock is unchanged.' : 'Request cancelled. Stock is unchanged.' };
  }
  else if (route === '/borrowings/summary') {
    const list = browserLoans.filter(loan => user.role !== 'student' || loan.student === user._id).map(loanView);
    body = { activeCount: list.filter(loan => ['borrowed', 'overdue'].includes(loan.displayStatus)).length, pendingCount: list.filter(loan => loan.status === 'pending').length, overdueCount: list.filter(loan => loan.displayStatus === 'overdue').length, recent: [...list].reverse().slice(0, 5), upcoming: list.filter(loan => loan.displayStatus === 'borrowed').slice(0, 5) };
  } else if (route === '/borrowings' && request.method === 'POST') {
    const loan = { ...input, _id: String(100 + browserLoans.length).padStart(24, '0'), borrowedAt: dayStart(input.borrowedAt), dueDate: dayEnd(input.dueDate), status: 'borrowed', returnedAt: null, issuedBy: user._id };
    browserLoans.push(loan); catalog.find(book => book._id === input.book).availableCopies--;
    status = 201; body = { borrowing: loanView(loan), message: 'Book issued.' };
  } else if (route.endsWith('/return') && route.startsWith('/borrowings/')) {
    const loan = browserLoans.find(item => item._id === route.split('/')[2]);
    returnRequests++; loan.returnedAt = new Date(); loan.returnedBy = user._id; loan.status = 'returned';
    catalog.find(book => book._id === loan.book).availableCopies++;
    body = { message: 'Book returned. Borrowing history is preserved.' };
  } else if (route === '/borrowings' || route === '/borrowings/my') {
    const params = new URL(request.url).searchParams;
    const list = browserLoans.filter(loan => user.role !== 'student' || loan.student === user._id).map(loanView).filter(loan => !params.get('status') ? true : params.get('status') === 'active' ? ['borrowed', 'overdue'].includes(loan.displayStatus) : params.get('status') === 'history' ? ['returned', 'rejected', 'cancelled'].includes(loan.status) : loan.displayStatus === params.get('status'));
    body = { borrowings: list, total: list.length, page: 1, pages: 1 };
  }
  else if (route === '/books/stats') body = { stats: catalog.filter(book => book.isActive).reduce((stats, book) => ({ totalTitles: stats.totalTitles + 1, totalCopies: stats.totalCopies + book.totalCopies, availableCopies: stats.availableCopies + book.availableCopies, borrowedCopies: stats.borrowedCopies + book.totalCopies - book.availableCopies }), { totalTitles: 0, totalCopies: 0, availableCopies: 0, borrowedCopies: 0 }) };
  else if (route === '/books' && request.method === 'POST') {
    const book = { ...input, _id: '000000000000000000000012', availableCopies: input.totalCopies, isActive: true, __v: 0 };
    catalog.push(book); status = 201; body = { book, message: 'Book added.' };
  } else if (route === '/books') {
    const params = new URL(request.url).searchParams;
    const list = catalog.filter(book => book.isActive === (params.get('state') !== 'archived') && (!params.get('search') || `${book.title} ${book.author} ${book.isbn}`.toLowerCase().includes(params.get('search').toLowerCase())) && (!params.get('category') || book.category === params.get('category')) && (!params.get('availability') || (book.availableCopies > 0) === (params.get('availability') === 'available')));
    body = { books: list, total: list.length, page: 1, pages: 1, categories: [...new Set(catalog.filter(book => book.isActive).map(book => book.category))] };
  } else if (route.startsWith('/books/')) {
    const book = catalog.find(item => item._id === route.split('/')[2]);
    if (request.method === 'PUT') { Object.assign(book, input, { availableCopies: input.totalCopies, __v: book.__v + 1 }); body = { book, message: 'Book updated.' }; }
    else if (request.method === 'DELETE') { archiveRequests++; book.isActive = false; body = { message: 'Book archived. Borrowing history is preserved.' }; }
    else body = { book };
  }
  else { status = 404; body = { message: 'Test endpoint unavailable.' }; }
  await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }],
    body: Buffer.from(JSON.stringify(body)).toString('base64'),
  });
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(port, 'Chrome must expose its local DevTools port.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error('DevTools command failed.')); else request.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      intercept(message.params).catch(error => { eventFailure = error; });
    } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params);
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate('/register');
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  await fill('email', 'studentgmail.com');
  assert.equal(await evaluate(`document.querySelectorAll('#email-checks .invalid').length`), 1);
  await fill('email', 'student@browser.test');
  assert.equal(await evaluate(`document.querySelectorAll('#email-checks .valid').length`), 2);
  await fill('password', 'weak');
  assert.ok(await evaluate(`document.querySelectorAll('#password-checks .invalid').length > 0`));
  await fill('password', password);
  assert.equal(await evaluate(`document.querySelectorAll('#password-checks .valid').length`), 7);
  await evaluate(`document.querySelector('[aria-label="Show password"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[name="password"]').type`), 'text');
  await fill('confirmPassword', password + 'x');
  assert.equal(await evaluate(`document.querySelectorAll('#confirmPassword-checks .invalid').length`), 1);
  await fill('confirmPassword', password);
  assert.equal(await evaluate(`document.querySelectorAll('#confirmPassword-checks .valid').length`), 1);
  for (const [name, value] of Object.entries({ studentId: 'BROWSER-REG', name: 'Browser Registration', course: 'Other', yearLevel: '2nd Year' })) await fill(name, value);
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  await fill('otherProgram', 'Fine Arts');
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), false);
  await fill('confirmPassword', password + 'x');
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  await fill('confirmPassword', password);
  await evaluate(`document.querySelector('[aria-label="Hide password"]').click()`);
  await mkdir('test-results', { recursive: true });
  const desktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile('test-results/registration-desktop.png', Buffer.from(desktop.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile('test-results/registration-mobile.png', Buffer.from(mobile.data, 'base64'));
  registrationFailure = 'duplicate';
  await submit();
  await waitFor(`document.querySelector('#studentId-error')?.textContent.includes('already registered')`);
  assert.equal(await evaluate(`document.querySelector('[name="studentId"]').getAttribute('aria-invalid')`), 'true');
  await fill('studentId', 'BROWSER-REG-NEW');
  registrationFailure = 'network';
  await submit();
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Cannot reach')`);
  registrationFailure = undefined;
  await submit();
  await waitFor(`location.pathname === '/login' && !!document.querySelector('.success')`);
  console.log('PASS: live validation, show/hide, invalid-form disablement, Other program, desktop/tablet/mobile layouts, duplicate/network errors and registration-to-login redirect.');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const role of ['admin', 'librarian', 'student']) {
    await fill('email', `${role}@browser.test`); await fill('password', 'legacy-password');
    assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), false);
    await submit(); await waitFor(`location.pathname === '/${role}' && !!document.querySelector('.content')`);
    assert.equal(await evaluate(`document.querySelectorAll('nav a[aria-current="page"]').length`), 1);
    await navigate(role === 'student' ? '/admin/users' : `/${role}/users`);
    if (role === 'student') await waitFor(`location.pathname === '/student'`);
    else {
      await waitFor(`document.querySelector('form') !== null`);
      await fill('course', 'BSIT'); await fill('yearLevel', '3rd Year');
      assert.equal(await evaluate(`document.querySelector('[name="yearLevel"]').value`), '3rd Year');
    }
    await navigate(`/${role}/books`);
    await waitFor(`document.querySelector('.inventory-table') !== null`);
    if (role === 'student') {
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => ['Add Book','Edit','Archive'].includes(button.textContent))`), false);
    } else if (role === 'admin') {
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Add Book').click()`);
      await waitFor(`document.querySelector('dialog[open]') !== null`);
      for (let press = 0; press < 3; press++) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`), true);
      }
      assert.equal(await evaluate(`document.querySelector('dialog button[type="submit"]').disabled`), true);
      for (const [name, value] of Object.entries({ title: 'Browser Test Book', author: 'Test Author', isbn: '9780262033848', category: 'Algorithms', totalCopies: '2' })) await fill(name, value);
      await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
      await waitFor(`!document.querySelector('dialog') && document.querySelector('.inventory-table')?.textContent.includes('Browser Test Book')`);
      await fill('search', 'Browser Test Book');
      await waitFor(`document.querySelectorAll('tbody tr').length === 1`);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Edit').click()`);
      await waitFor(`document.querySelector('dialog[open]') !== null`);
      await fill('totalCopies', '4');
      await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
      await waitFor(`!document.querySelector('dialog') && document.querySelector('tbody tr')?.textContent.includes('4')`);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Archive').click()`);
      await waitFor(`document.querySelector('#archive-title') !== null`);
      await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Cancel').click()`);
      assert.equal(archiveRequests, 0);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Archive').click()`);
      await waitFor(`document.querySelector('#archive-title') !== null`);
      await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Confirm archive').click()`);
      await waitFor(`document.querySelector('.empty-state') !== null`);
      assert.equal(archiveRequests, 1);
    }
    await fill('search', '');
    await waitFor(`document.querySelector('.inventory-table') !== null`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Details').click()`);
    await waitFor(`document.querySelector('#book-details-title') !== null`);
    await evaluate(`document.querySelector('dialog button').click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    const bookScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(`test-results/books-${role}-mobile.png`, Buffer.from(bookScreenshot.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    if (role !== 'student') {
      await navigate(`/${role}`);
      await waitFor(`document.querySelector('[data-stat="totalTitles"]')?.textContent === '1'`);
      assert.equal(await evaluate(`document.querySelector('[data-stat="totalCopies"]').textContent`), '3');
    }
    await navigate(role === 'student' ? '/student/my-books' : `/${role}/borrowings`);
    await waitFor(`document.querySelector('.pagination') !== null`);
    if (role !== 'student') {
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Borrow Book').click()`);
      await waitFor(`document.querySelector('dialog select[name="student"]')?.options.length > 1 && document.querySelector('dialog select[name="book"]')?.options.length > 1`);
      await choose('student', fixtures[2]._id); await choose('book', catalog[0]._id);
      if (role === 'admin') await fill('borrowedAt', addDays(dateKey(), -8));
      await waitFor(`!document.querySelector('dialog button[type="submit"]').disabled`);
      await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
      await waitFor(`!document.querySelector('dialog') && document.querySelector('.borrowing-table') !== null`);
      if (role === 'admin') {
        assert.equal(await evaluate(`document.querySelector('tbody').textContent.includes('overdue')`), true);
        await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Return Book').click()`);
        await waitFor(`document.querySelector('#return-title') !== null`);
        await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Cancel').click()`);
        assert.equal(returnRequests, 0);
        await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Return Book').click()`);
        await waitFor(`document.querySelector('#return-title') !== null`);
        await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Confirm return').click()`);
        await waitFor(`!document.querySelector('dialog') && document.querySelector('.empty-state') !== null`);
        assert.equal(returnRequests, 1);
        await fill('status', 'returned');
        await waitFor(`document.querySelector('.borrowing-table')?.textContent.includes('returned')`);
      }
    } else {
      await waitFor(`document.querySelector('.borrowing-table') !== null`);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => ['Return Book','Borrow Book'].includes(button.textContent))`), false);
      await fill('status', 'returned');
      await waitFor(`document.querySelector('.borrowing-table')?.textContent.includes('returned')`);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    const loanScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(`test-results/borrowings-${role}-mobile.png`, Buffer.from(loanScreenshot.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate(`/${role}`);
    await waitFor(`document.querySelector('[data-loan-stat="active"]')?.textContent === '${role === 'admin' ? 0 : 1}'`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sign out').click()`);
    await waitFor(`location.pathname === '/login'`);
  }
  catalog.push({ _id: '000000000000000000000020', title: 'Request Workflow', author: 'Test Author', isbn: '9780132350884', category: 'Programming', totalCopies: 2, availableCopies: 2, isActive: true, __v: 0 });
  catalog.push({ _id: '000000000000000000000021', title: 'Reject Workflow', author: 'Test Author', isbn: '9780201633610', category: 'Programming', totalCopies: 2, availableCopies: 2, isActive: true, __v: 0 });
  async function signIn(role) { await fill('email', `${role}@browser.test`); await fill('password', 'legacy-password'); await submit(); await waitFor(`location.pathname === '/${role}' && !!document.querySelector('.content')`); }
  async function signOut() { await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sign out').click()`); await waitFor(`location.pathname === '/login'`); }
  async function requestTitle(title) {
    await navigate('/student/books'); await fill('search', title);
    await waitFor(`document.querySelectorAll('tbody tr').length === 1 && document.querySelector('tbody').textContent.includes('${title}')`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Request to Borrow').click()`);
    await waitFor(`document.querySelector('#request-action-title') !== null`);
    await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
    await waitFor(`!document.querySelector('dialog') && document.querySelector('tbody')?.textContent.includes('Request pending')`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Request to Borrow').disabled`), true);
  }
  await signIn('student'); await requestTitle('Request Workflow');
  assert.equal(catalog.find(book => book.title === 'Request Workflow').availableCopies, 2);
  await navigate('/student/my-books');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Pending Requests').click()`);
  await waitFor(`document.querySelector('tbody')?.textContent.includes('Request Workflow')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Cancel Request').click()`);
  await waitFor(`document.querySelector('#request-action-title') !== null`);
  await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
  await waitFor(`!document.querySelector('dialog') && document.querySelector('.empty-state') !== null`);
  await requestTitle('Request Workflow'); await signOut();
  await signIn('librarian'); await navigate('/librarian/borrowings');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Pending Requests').click()`);
  await waitFor(`document.querySelector('tbody')?.textContent.includes('Request Workflow')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Approve and Issue').click()`);
  await waitFor(`document.querySelector('#request-action-title') !== null`);
  await fill('requestDueDate', addDays(dateKey(), 10));
  await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
  await waitFor(`!document.querySelector('dialog') && document.querySelector('.empty-state') !== null`);
  assert.equal(catalog.find(book => book.title === 'Request Workflow').availableCopies, 1);
  await signOut(); await signIn('student'); await requestTitle('Reject Workflow'); await signOut();
  await signIn('admin'); await navigate('/admin/borrowings');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Pending Requests').click()`);
  await waitFor(`document.querySelector('tbody')?.textContent.includes('Reject Workflow')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Reject').click()`);
  await waitFor(`document.querySelector('#request-action-title') !== null`);
  assert.equal(await evaluate(`document.querySelector('dialog button[type="submit"]').disabled`), true);
  await fill('rejectionReason', 'Please visit the library desk.');
  await evaluate(`document.querySelector('dialog button[type="submit"]').click()`);
  await waitFor(`!document.querySelector('dialog') && document.querySelector('.empty-state') !== null`);
  assert.equal(catalog.find(book => book.title === 'Reject Workflow').availableCopies, 2);
  await signOut(); await signIn('student'); await navigate('/student/my-books');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Borrowing History').click()`);
  await waitFor(`document.querySelector('main').textContent.includes('Please visit the library desk.') && document.querySelector('main').textContent.includes('cancelled')`);
  const requestsScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile('test-results/student-request-history.png', Buffer.from(requestsScreenshot.data, 'base64'));
  await signOut();
  assert.equal(exceptions.length, 0, 'No browser runtime exceptions.');
  console.log('PASS: all role redirects, refresh session restoration, shared staff student fields, student route protection, legacy-password login UI and logout; zero browser runtime exceptions.');
  console.log('PASS: book create/edit/search, archive confirmation/cancellation, details, mobile catalog, Student read-only access and refreshed dashboard statistics.');
  console.log('PASS: searchable issue choices/dates, overdue badges, return confirmation/cancellation, preserved history, Student My Books without write controls, live dashboard summaries and mobile loan cards.');
  console.log('PASS: Student request confirmation/status, cancellation, staff approval/due dates and rejection reasons, unchanged pending/rejection stock and Student request history.');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  chrome.kill();
  web.httpServer.closeAllConnections();
  await new Promise(resolve => web.httpServer.close(resolve));
  if (path.resolve(profile).startsWith(path.resolve(profilePrefix))) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
