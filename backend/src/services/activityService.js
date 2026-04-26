const { getSupabaseClient } = require('../lib/supabaseClient');

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    if (value.id !== undefined) return normalizeId(value.id);
    if (value._id !== undefined) return normalizeId(value._id);
    if (typeof value.toString === 'function') {
      const asString = String(value.toString()).trim();
      if (asString && asString !== '[object Object]') return asString;
    }
  }
  return '';
}

async function recordActivity({ userId, type, minutes = 1, meta = {}, createdAt = null }) {
  const safeUserId = normalizeId(userId);
  const safeType = String(type || '').trim();
  if (!safeUserId || !safeType) return null;

  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const safeMeta = meta && typeof meta === 'object' ? meta : {};

  const supabase = getSupabaseClient();
  const now = createdAt ? new Date(createdAt) : new Date();

  const { data, error } = await supabase
    .from('activity_logs')
    .insert({
      user_id: safeUserId,
      type: safeType,
      minutes: safeMinutes,
      meta: safeMeta,
      created_at: now.toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function countActivities({ userId, type, from = null, to = null } = {}) {
  const safeUserId = normalizeId(userId);
  const safeType = type ? String(type).trim() : '';
  if (!safeUserId) return 0;

  const supabase = getSupabaseClient();
  let q = supabase
    .from('activity_logs')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', safeUserId);

  if (safeType) q = q.eq('type', safeType);
  if (from) q = q.gte('created_at', new Date(from).toISOString());
  if (to) q = q.lt('created_at', new Date(to).toISOString());

  const { count, error } = await q;
  if (error) throw error;
  return Number(count || 0);
}

async function listActivities({ userIds = [], types = [], since = null, until = null, limit = 1000 } = {}) {
  const safeUserIds = (Array.isArray(userIds) ? userIds : []).map(normalizeId).filter(Boolean);
  const safeTypes = (Array.isArray(types) ? types : []).map((value) => String(value || '').trim()).filter(Boolean);

  if (!safeUserIds.length) return [];

  const allUsers = safeUserIds.includes('*');

  const supabase = getSupabaseClient();
  let q = supabase
    .from('activity_logs')
    .select('id,user_id,type,minutes,meta,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(10000, Number(limit) || 1000)));

  if (!allUsers) {
    q = q.in('user_id', safeUserIds);
  }

  if (safeTypes.length) q = q.in('type', safeTypes);
  if (since) q = q.gte('created_at', new Date(since).toISOString());
  if (until) q = q.lt('created_at', new Date(until).toISOString());

  const { data, error } = await q;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

module.exports = { recordActivity, countActivities, listActivities, __normalizeActivityUserId: normalizeId };
