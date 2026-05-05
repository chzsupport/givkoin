const { getSupabaseClient } = require('../lib/supabaseClient');

const CACHE_TTL_MS = 60 * 1000; // 60 секунд
const MAX_CACHE_SIZE = 10000;

const cache = new Map();

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function fetchUserById(userId) {
  if (!userId) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', String(userId))
      .maybeSingle();
    if (error || !data) return null;
    const extra = getUserData(data);
    return {
      _id: data.id, id: data.id, email: data.email,
      role: data.role, nickname: data.nickname, status: data.status,
      emailConfirmed: Boolean(data.email_confirmed),
      emailConfirmedAt: data.email_confirmed_at,
      accessRestrictedUntil: data.access_restricted_until,
      accessRestrictionReason: data.access_restriction_reason,
      language: data.language, lastSeenAt: data.last_seen_at,
      lastOnlineAt: data.last_online_at, lastIp: data.last_ip,
      lastDeviceId: data.last_device_id, lastFingerprint: data.last_fingerprint,
      lastWeakFingerprint: extra.lastWeakFingerprint || '',
      lastIpIntel: extra.lastIpIntel || null,
      createdAt: data.created_at, updatedAt: data.updated_at,
      ...extra, data: extra,
    };
  } catch (_err) {
    return null;
  }
}

async function getCachedUser(userId) {
  if (!userId) return null;
  const key = String(userId);
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now < entry.expiresAt) return entry.user;

  const user = await fetchUserById(userId);
  if (!user) {
    cache.delete(key);
    return null;
  }

  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  cache.set(key, { user, expiresAt: now + CACHE_TTL_MS });
  return user;
}

function invalidateUser(userId) {
  if (userId) cache.delete(String(userId));
}

function clearCache() {
  cache.clear();
}

// Очистка устаревших записей раз в 2 минуты
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) cache.delete(key);
  }
}, 120 * 1000);

module.exports = { getCachedUser, invalidateUser, clearCache, fetchUserById };
