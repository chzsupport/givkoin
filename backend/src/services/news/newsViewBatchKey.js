const crypto = require('crypto');
const { toId } = require('./newsCommon');

function signNewsViewBatchPayload(encodedPayload, secret) {
  return crypto
    .createHmac('sha256', String(secret || ''))
    .update(String(encodedPayload || ''))
    .digest('hex');
}

function hasValidNewsViewBatchSignature(encodedPayload, signature, secret) {
  const expected = Buffer.from(signNewsViewBatchPayload(encodedPayload, secret));
  const actual = Buffer.from(String(signature || ''));
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function createNewsViewBatchKey({
  userId,
  postIds,
  now = new Date(),
  secret,
  ttlMs,
} = {}) {
  const safeUserId = toId(userId);
  const safePostIds = Array.from(new Set((Array.isArray(postIds) ? postIds : []).map(toId).filter(Boolean)));
  if (!safeUserId || !safePostIds.length) return null;

  const payload = {
    u: safeUserId,
    p: safePostIds,
    e: now.getTime() + Math.max(0, Number(ttlMs) || 0),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signNewsViewBatchPayload(encoded, secret)}`;
}

function parseNewsViewBatchKey(viewBatchKey, userId, {
  nowMs = Date.now(),
  secret,
} = {}) {
  const safeUserId = toId(userId);
  const raw = String(viewBatchKey || '').trim();
  if (!safeUserId || !raw) return null;

  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex <= 0) return null;

  const encodedPayload = raw.slice(0, dotIndex);
  const signature = raw.slice(dotIndex + 1);
  if (!hasValidNewsViewBatchSignature(encodedPayload, signature, secret)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (toId(payload.u) !== safeUserId) return null;
    if ((Number(payload.e) || 0) < nowMs) return null;
    return Array.from(new Set((Array.isArray(payload.p) ? payload.p : []).map(toId).filter(Boolean)));
  } catch {
    return null;
  }
}

function normalizeViewBucketPostIds(postIds, limit) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(postIds) ? postIds : [];
  for (const id of list) {
    const key = toId(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  const safeLimit = Math.max(1, Number(limit) || 1);
  if (out.length <= safeLimit) return out;
  return out.slice(out.length - safeLimit);
}

module.exports = {
  signNewsViewBatchPayload,
  hasValidNewsViewBatchSignature,
  createNewsViewBatchKey,
  parseNewsViewBatchKey,
  normalizeViewBucketPostIds,
};
