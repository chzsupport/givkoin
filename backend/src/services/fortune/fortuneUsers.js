const { getSupabaseClient } = require('../../lib/supabaseClient');

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function extractNicknameOrNull(value) {
  const nickname = typeof value === 'string' ? value.trim() : '';
  return nickname || null;
}

async function getUserRowById(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  const id = toId(userId);
  if (!id || !patch || typeof patch !== 'object') return null;

  const row = await getUserRowById(id);
  if (!row) return null;

  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,email,nickname,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getUsersByIds(ids) {
  const list = Array.isArray(ids) ? ids.map((value) => String(value)).filter(Boolean) : [];
  if (!list.length) return new Map();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .in('id', list);
  const rows = !error && Array.isArray(data) ? data : [];
  const map = new Map();

  rows.forEach((row) => {
    const userData = getUserData(row);
    map.set(String(row.id), {
      id: String(row.id),
      email: row.email || userData.email || null,
      nickname: row.nickname || userData.nickname || null,
      data: userData,
    });
  });

  return map;
}

module.exports = {
  extractNicknameOrNull,
  getUserData,
  getUserRowById,
  getUsersByIds,
  toId,
  updateUserDataById,
};
