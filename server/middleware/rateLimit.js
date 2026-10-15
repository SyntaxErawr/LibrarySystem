// Suitable for the current single-process local API. No extra dependencies.
module.exports = function rateLimit(limit, message) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= limit || attempts.size >= 10000 && !attempts.has(key)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
      return res.status(429).json({ message });
    }
    entry.count += 1;
    attempts.set(key, entry);
    next();
  };
};
