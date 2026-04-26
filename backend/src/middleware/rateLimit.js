const { extractClientMeta } = require('../services/authTrackingService');

const DEFAULT_CLEANUP_EVERY = 256;

function getClientIp(req) {
  const client = extractClientMeta(req);
  return client.ip || req.ip || 'unknown';
}

function buildUserOrIpKey(req) {
  const userId = req.user?._id || req.user?.userId;
  if (userId) {
    return `user:${String(userId)}`;
  }
  return `ip:${getClientIp(req)}`;
}

function resolveScope(req, scope) {
  const defaultScope = `${req.method}:${req.baseUrl || ''}${req.path || req.originalUrl || ''}`;
  if (typeof scope === 'function') {
    return String(scope(req) || defaultScope);
  }
  return String(scope || defaultScope);
}

function buildRateKey(req, prefix, keyBuilder) {
  if (typeof keyBuilder === 'function') {
    return `${prefix}:${keyBuilder(req)}`;
  }
  return `${prefix}:${getClientIp(req)}`;
}

function cleanupExpiredBuckets(buckets, now) {
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket || bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyBuilder,
  message = 'Слишком много запросов. Попробуйте позже.',
  scope,
} = {}) {
  const buckets = new Map();
  let requestsSinceCleanup = 0;

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= DEFAULT_CLEANUP_EVERY || buckets.size > 5000) {
      cleanupExpiredBuckets(buckets, now);
      requestsSinceCleanup = 0;
    }

    const prefix = resolveScope(req, scope);
    const key = buildRateKey(req, prefix, keyBuilder);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count <= max) {
      buckets.set(key, current);
      return next();
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ message });
  };
}

module.exports = {
  buildUserOrIpKey,
  createRateLimiter,
};
