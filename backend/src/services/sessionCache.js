const { getSupabaseClient } = require('../lib/supabaseClient');

const CACHE_TTL_MS = 60 * 1000; // 60 секунд
const MAX_CACHE_SIZE = 10000;

const cache = new Map();

async function checkSessionActiveInDb({ userId, sessionId }) {
  if (!userId || !sessionId) return true;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('is_active')
      .eq('user_id', String(userId))
      .eq('session_id', String(sessionId))
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.is_active);
  } catch (_err) {
    return true;
  }
}

async function isSessionActiveCached({ userId, sessionId }) {
  if (!userId || !sessionId) return true;
  const key = `${userId}:${sessionId}`;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now < entry.expiresAt) return entry.active;

  const active = await checkSessionActiveInDb({ userId, sessionId });

  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  cache.set(key, { active, expiresAt: now + CACHE_TTL_MS });
  return active;
}

function invalidateSession(userId, sessionId) {
  if (userId && sessionId) cache.delete(`${userId}:${sessionId}`);
}

function invalidateAllUserSessions(userId) {
  if (!userId) return;
  const prefix = `${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function clearCache() {
  cache.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) cache.delete(key);
  }
}, 120 * 1000);

module.exports = { isSessionActiveCached, invalidateSession, invalidateAllUserSessions, clearCache };
