const { getSupabaseClient } = require('../../lib/supabaseClient');

const ACTIVE_HOURS_WINDOW = 72;

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function updateUserDataById(userId, patch, { userRow = null } = {}) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = userRow || await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,email,nickname,data')
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function toId(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id);
    if (value.id != null) return toId(value.id);
  }
  return '';
}

async function listUsersPage({ from = 0, limit = 200 } = {}) {
  const supabase = getSupabaseClient();
  const safeFrom = Math.max(0, Number(from) || 0);
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 200));
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,role,status,email_confirmed,last_online_at,last_seen_at,data')
    .range(safeFrom, safeFrom + safeLimit - 1);
  if (error || !Array.isArray(data)) return [];
  return data;
}

async function getUsersByIds(userIds = []) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .in('id', ids);
  if (error || !Array.isArray(data)) return [];
  return data;
}

function getActiveUsersThresholdDate(now = new Date()) {
  return new Date(new Date(now).getTime() - ACTIVE_HOURS_WINDOW * 60 * 60 * 1000);
}

function isBattleAdminEmail(email) {
  return /@admin(\.|$)/i.test(String(email || ''));
}

async function getActiveUsersCountSnapshot(now = new Date()) {
  const threshold = getActiveUsersThresholdDate(now);

  const thresholdMs = new Date(threshold).getTime();
  const isRecentEnough = (value) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() >= thresholdMs;
  };

  const strictFilter = (row) => {
    const data = getUserData(row);
    const status = String(data.status || row.status || '');
    if (status !== 'active') return false;
    const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
    if (!emailConfirmed) return false;
    if (isBattleAdminEmail(row.email || data.email)) return false;
    const recent = isRecentEnough(data.lastOnlineAt || row.last_online_at) || isRecentEnough(data.lastSeenAt || row.last_seen_at);
    if (!recent) return false;
    return Boolean(data.quietWatchPassed);
  };

  const fallbackFilter = (row) => {
    const data = getUserData(row);
    const status = String(data.status || row.status || '');
    if (status !== 'active') return false;
    const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
    if (!emailConfirmed) return false;
    if (isBattleAdminEmail(row.email || data.email)) return false;
    const recent = isRecentEnough(data.lastOnlineAt || row.last_online_at) || isRecentEnough(data.lastSeenAt || row.last_seen_at);
    if (!recent) return false;
    const role = String(data.role || row.role || '');
    return role === 'user';
  };

  const pageSize = 500;
  let offset = 0;
  let strictCount = 0;
  let fallbackCount = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await listUsersPage({ from: offset, limit: pageSize });
    if (!rows.length) break;
    for (const row of rows) {
      if (strictFilter(row)) strictCount += 1;
      if (fallbackFilter(row)) fallbackCount += 1;
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  if (strictCount > 0) return strictCount;
  return fallbackCount;
}

async function getWorldLivingUsersCount() {
  const pageSize = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await listUsersPage({ from: offset, limit: pageSize });
    if (!rows.length) break;
    for (const row of rows) {
      const data = getUserData(row);
      const status = String(data.status || row.status || '');
      if (status !== 'active') continue;
      const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
      if (!emailConfirmed) continue;
      const role = String(data.role || row.role || '');
      if (role !== 'user') continue;
      if (isBattleAdminEmail(row.email || data.email)) continue;
      total += 1;
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  return total;
}

module.exports = {
  getActiveUsersCountSnapshot,
  getActiveUsersThresholdDate,
  getUserData,
  getUserRowById,
  getUsersByIds,
  getWorldLivingUsersCount,
  isBattleAdminEmail,
  listUsersPage,
  toId,
  updateUserDataById,
};
