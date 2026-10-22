function runtimeConfig(env = process.env) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const production = env.NODE_ENV === 'production';
  const clientUrl = env.CLIENT_URL || (production ? '' : 'http://localhost:5173');
  let url;
  try { url = new URL(clientUrl); } catch { throw new Error('Set CLIENT_URL to a single frontend origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== clientUrl || url.username || url.password) throw new Error('CLIENT_URL must be an origin without a path or trailing slash.');
  if (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Production requires an HTTPS frontend origin.');
  const proxy = env.TRUST_PROXY || '0';
  if (!['0', '1'].includes(proxy)) throw new Error('TRUST_PROXY must be 0 or 1.');
  return { port, clientUrl, trustProxy: proxy === '1' ? 1 : false, allowLocalFlutterWeb: env.ALLOW_LOCAL_FLUTTER_WEB === 'true' };
}
module.exports = { runtimeConfig };
