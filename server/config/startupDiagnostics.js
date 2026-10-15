// Never serialize driver errors: their messages/causes can contain private URIs.
function category(error) {
  const errors = [error, error?.cause, ...(error?.reason?.servers?.values?.() || [])].filter(Boolean);
  const codes = errors.flatMap(item => [item.code, item.error?.code]);
  const names = errors.flatMap(item => [item.name, item.error?.name]);
  if (codes.includes(18) || codes.includes(8000)) return 'database-authentication';
  if (codes.includes(13)) return 'database-permission';
  if (codes.includes(11000)) return 'duplicate-data-index';
  if (codes.includes(85) || codes.includes(86)) return 'index-definition-conflict';
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ECONNREFUSED'].includes(code))) return 'dns-or-network';
  if (codes.some(code => typeof code === 'string' && /TLS|SSL|CERT/.test(code))) return 'tls';
  if (codes.includes('EADDRINUSE')) return 'port-in-use';
  if (codes.includes('EACCES')) return 'permission-denied';
  if (names.some(name => ['MongoParseError', 'MongoInvalidArgumentError'].includes(name))) return 'database-uri-format';
  if (names.some(name => /ServerSelection|Network|Timeout/.test(name || ''))) return 'database-network-or-selection';
  // Only match known application messages; output is always a fixed label.
  const message = error?.message || '';
  if (message === 'Configure a JWT secret of at least 32 characters.') return 'configuration-jwt_secret';
  for (const field of ['PORT', 'CLIENT_URL', 'TRUST_PROXY', 'JWT_SECRET', 'MONGO_URI']) {
    if (message.includes(field)) return `configuration-${field.toLowerCase()}`;
  }
  if (message === 'Production requires an HTTPS frontend origin.') return 'configuration-client_url';
  return 'unexpected-error';
}

async function startupStage(stage, action, log = console.log, report = console.error) {
  log(`[startup] stage=${stage} status=starting`);
  try {
    const result = await action();
    log(`[startup] stage=${stage} status=ok`);
    return result;
  } catch (error) {
    report(`[startup] stage=${stage} status=failed category=${category(error)}`);
    throw error;
  }
}
module.exports = { category, startupStage };
