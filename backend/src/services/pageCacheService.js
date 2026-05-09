const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 2000;

const pageCache = new Map();
const pageInflight = new Map();

function stablePart(value) {
  if (Array.isArray(value)) {
    return value.map(stablePart);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stablePart(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function makePageCacheKey(scope, parts = {}) {
  return `${String(scope || 'page')}:${JSON.stringify(stablePart(parts || {}))}`;
}

function cleanupPageCache(nowMs = Date.now()) {
  for (const [key, entry] of pageCache.entries()) {
    if (!entry || Number(entry.expiresAtMs) <= nowMs) {
      pageCache.delete(key);
    }
  }

  while (pageCache.size > MAX_CACHE_SIZE) {
    const oldestKey = pageCache.keys().next().value;
    if (!oldestKey) break;
    pageCache.delete(oldestKey);
  }
}

function readCachedPage(key, nowMs = Date.now()) {
  cleanupPageCache(nowMs);
  const entry = pageCache.get(String(key || ''));
  if (!entry || Number(entry.expiresAtMs) <= nowMs) {
    pageCache.delete(String(key || ''));
    return null;
  }
  return entry.value;
}

function writeCachedPage(key, value, ttlMs = DEFAULT_TTL_MS, nowMs = Date.now()) {
  if (!key) return value;
  cleanupPageCache(nowMs);
  pageCache.set(String(key), {
    value,
    expiresAtMs: nowMs + Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS),
  });
  return value;
}

async function getOrLoadPage(key, loader, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const cached = readCachedPage(key);
  if (cached !== null) {
    return { value: cached, source: 'memory' };
  }

  if (pageInflight.has(key)) {
    return { value: await pageInflight.get(key), source: 'wait' };
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => writeCachedPage(key, value, ttlMs))
    .finally(() => {
      pageInflight.delete(key);
    });

  pageInflight.set(key, promise);
  return { value: await promise, source: 'db' };
}

function warmPage(key, loader, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!key || readCachedPage(key) !== null || pageInflight.has(key)) return;

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => writeCachedPage(key, value, ttlMs))
    .catch(() => null)
    .finally(() => {
      pageInflight.delete(key);
    });

  pageInflight.set(key, promise);
}

function clearPageCacheByPrefix(prefix) {
  const safePrefix = String(prefix || '');
  if (!safePrefix) return;
  for (const key of pageCache.keys()) {
    if (key.startsWith(safePrefix)) {
      pageCache.delete(key);
    }
  }
  for (const key of pageInflight.keys()) {
    if (key.startsWith(safePrefix)) {
      pageInflight.delete(key);
    }
  }
}

module.exports = {
  clearPageCacheByPrefix,
  getOrLoadPage,
  makePageCacheKey,
  readCachedPage,
  warmPage,
  writeCachedPage,
};
