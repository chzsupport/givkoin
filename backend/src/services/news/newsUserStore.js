const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { getUserData, toId } = require('./newsCommon');

function buildCommentNicknameMap(rows) {
  return new Map((Array.isArray(rows) ? rows : []).map((row) => {
    const data = getUserData(row);
    const nick = String(row?.nickname || data.nickname || '').trim();
    return [String(row.id), nick || ''];
  }));
}

function applyCommentUserNicknames(comments, rows) {
  const list = Array.isArray(comments) ? comments : [];
  const nickById = buildCommentNicknameMap(rows);

  for (const comment of list) {
    const uid = toId(comment?.user);
    if (!uid) continue;
    comment.user = { _id: uid, nickname: nickById.get(uid) || '' };
  }
  return list;
}

function createNewsUserStore({ getSupabaseClient = defaultGetSupabaseClient } = {}) {
  async function getUserRowById(userId) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id,nickname,email,data')
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
      .select('id,data')
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  async function hydrateCommentUsers(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const ids = Array.from(new Set(list.map((comment) => toId(comment?.user)).filter(Boolean)));
    if (!ids.length) return list;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id,nickname,data')
      .in('id', ids);
    const rows = !error && Array.isArray(data) ? data : [];
    return applyCommentUserNicknames(list, rows);
  }

  return {
    getUserRowById,
    updateUserDataById,
    hydrateCommentUsers,
  };
}

module.exports = {
  buildCommentNicknameMap,
  applyCommentUserNicknames,
  createNewsUserStore,
};
