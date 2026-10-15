const path = require('node:path');
// Hosting injects process.env directly. Never depend on a deployed .env file.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true, override: false });
}
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { runtimeConfig } = require('./config/runtime');
const { startupStage } = require('./config/startupDiagnostics');

function createApp({ clientUrl = runtimeConfig().clientUrl, trustProxy = runtimeConfig().trustProxy } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === clientUrl) return callback(null, true);
      const error = new Error('Origin is not allowed.');
      error.status = 403;
      callback(error);
    },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(['/api/auth', '/api/users', '/api/books', '/api/borrowings'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/books', require('./routes/bookRoutes'));
  app.use('/api/borrowings', require('./routes/borrowingRoutes'));
  app.get('/api', (req, res) => {
    res.json({ message: 'Library Management System API' });
  });
  app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'unavailable',
      database: connected ? 'connected' : 'disconnected',
    });
  });
  app.use((req, res) => res.status(404).json({ message: 'API route not found.' }));
  // Return safe messages rather than database errors, stack traces or credentials.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === 11000) {
      if (error.keyPattern?.student && error.keyPattern?.book) return res.status(409).json({ message: 'This student already has a pending request or active loan for this book.' });
      const field = error.keyPattern?.studentId ? 'studentId' : error.keyPattern?.email ? 'email' : error.keyPattern?.isbn ? 'isbn' : null;
      const message = field === 'studentId' ? 'This School ID is already registered.'
        : field === 'email' ? 'This email is already registered.' : field === 'isbn' ? 'This ISBN is already in the catalog.' : 'An account with this email or role already exists.';
      return res.status(409).json({ message, ...(field ? { fields: { [field]: message } } : {}) });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: 'Check the submitted fields and formats.' });
    }
    if (error.name === 'VersionError' || error.status === 409) return res.status(409).json({ message: error.status === 409 ? error.message : 'This record changed. Reload it and try again.' });
    if (error.hasErrorLabel?.('TransientTransactionError') || error.hasErrorLabel?.('UnknownTransactionCommitResult')) return res.status(503).json({ message: 'The transaction could not be confirmed. Refresh the records before trying again.' });
    if (error.status === 400 && !error.type) return res.status(400).json({ message: error.message, ...(error.fields ? { fields: error.fields } : {}) });
    if (['MongoServerSelectionError', 'MongoNetworkError', 'MongooseServerSelectionError'].includes(error.name)) {
      return res.status(503).json({ message: 'The database is temporarily unavailable. Please try again later.' });
    }
    const status = error.status || 500;
    const message = error.type === 'entity.parse.failed'
      ? 'Request body must be valid JSON.'
      : status === 403 ? 'Origin is not allowed.'
        : status === 413 ? 'Request body is too large.' : 'An unexpected server error occurred.';
    res.status(status).json({ message });
  });
  return app;
}

async function start() {
  const { port, clientUrl, trustProxy } = await startupStage('environment', () => runtimeConfig());
  await startupStage('jwt-configuration', () => require('./middleware/authMiddleware').jwtSecret());
  await startupStage('database-connect', () => connectDB());
  await startupStage('user-indexes', () => require('./models/User').init());
  await startupStage('book-indexes', () => require('./models/Book').init());
  await startupStage('borrowing-indexes', () => require('./models/Borrowing').init());
  const app = await startupStage('express-setup', () => createApp({ clientUrl, trustProxy }));
  const server = await startupStage('http-listen', async () => {
    const server = app.listen(port, '0.0.0.0');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    return server;
  });
  console.log(`Library API listening on port ${port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      const timeout = setTimeout(() => server.closeAllConnections(), 10000);
      timeout.unref();
      server.close(async () => {
        clearTimeout(timeout);
        await mongoose.disconnect();
        process.exitCode = 0;
      });
    });
  }
  return server;
}

if (require.main === module) {
  start().catch(async () => {
    console.error('API startup failed. See the preceding [startup] stage/category. Configure hosting environment variables; a local .env file is not required. No credentials are logged.');
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = { createApp, start };
