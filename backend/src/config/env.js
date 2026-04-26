const DEFAULT_DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3004', 'https://givkoin.vercel.app'];
const DEFAULT_PROD_FRONTEND_URL = 'https://your-frontend-service.onrender.com';

function parseCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripWrappingQuotes(value) {
  const v = String(value || '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function normalizeOrigin(raw) {
  const cleaned = stripWrappingQuotes(raw).replace(/\/+$/, '');
  if (!cleaned) return '';
  if (cleaned === '*') return '*';

  try {
    const url = new URL(cleaned);
    return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
  } catch (_error) {
    return cleaned;
  }
}

function parseOriginUrl(raw) {
  const normalized = normalizeOrigin(raw);
  if (!normalized || normalized === '*') return null;
  try {
    return new URL(normalized);
  } catch (_error) {
    return null;
  }
}

function isMatchingVercelPreview(origin, allowedOrigin) {
  const originUrl = parseOriginUrl(origin);
  const allowedUrl = parseOriginUrl(allowedOrigin);
  if (!originUrl || !allowedUrl) return false;
  if (originUrl.protocol !== allowedUrl.protocol) return false;
  if (!originUrl.hostname.endsWith('.vercel.app')) return false;
  if (!allowedUrl.hostname.endsWith('.vercel.app')) return false;

  const originLabel = originUrl.hostname.replace(/\.vercel\.app$/i, '');
  const allowedLabel = allowedUrl.hostname.replace(/\.vercel\.app$/i, '');
  if (!originLabel || !allowedLabel) return false;

  return originLabel === allowedLabel || originLabel.startsWith(`${allowedLabel}-`);
}

function getAllowedOrigins() {
  const fromEnv = parseCsv(process.env.CORS_ORIGINS)
    .map(normalizeOrigin)
    .filter(Boolean);
  if (fromEnv.length > 0) {
    return fromEnv;
  }

  const frontendFallback = normalizeOrigin(
    process.env.FRONTEND_URL || process.env.APP_URL || DEFAULT_PROD_FRONTEND_URL
  );

  if (process.env.NODE_ENV === 'production') {
    return frontendFallback ? [frontendFallback] : [];
  }

  const devOrigins = DEFAULT_DEV_ORIGINS.map(normalizeOrigin).filter(Boolean);
  return frontendFallback ? [...new Set([...devOrigins, frontendFallback])] : devOrigins;
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const normalizedAllowed = (allowedOrigins || [])
    .map(normalizeOrigin)
    .filter(Boolean);

  if (normalizedAllowed.includes('*')) return true;
  if (normalizedAllowed.includes(normalizedOrigin)) return true;

  return normalizedAllowed.some((allowedOrigin) =>
    isMatchingVercelPreview(normalizedOrigin, allowedOrigin)
  );
}

function getFrontendBaseUrl() {
  const fromEnv = String(process.env.FRONTEND_URL || process.env.APP_URL || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  return DEFAULT_PROD_FRONTEND_URL;
}

function getRedisUrl() {
  const directUrl = stripWrappingQuotes(process.env.REDIS_URL || process.env.REDIS_TLS_URL || '').trim();
  if (directUrl) return directUrl;

  const host = stripWrappingQuotes(process.env.REDIS_HOST || '').trim();
  if (!host) return '';

  const protocol = String(process.env.REDIS_TLS || '').toLowerCase() === 'true' ? 'rediss:' : 'redis:';
  const port = Number(process.env.REDIS_PORT) || 6379;
  const username = encodeURIComponent(stripWrappingQuotes(process.env.REDIS_USERNAME || '').trim());
  const password = encodeURIComponent(stripWrappingQuotes(process.env.REDIS_PASSWORD || '').trim());
  const database = Number(process.env.REDIS_DB) || 0;
  const auth = password ? `${username ? `${username}:` : ''}${password}@` : '';

  return `${protocol}//${auth}${host}:${port}/${database}`;
}

module.exports = {
  getAllowedOrigins,
  isOriginAllowed,
  getFrontendBaseUrl,
  getRedisUrl,
};

