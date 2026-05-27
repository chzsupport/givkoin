const { getSupabaseClient } = require('../../lib/supabaseClient');

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value === null || value === undefined) return '';
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

function mapChatRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    participants: Array.isArray(row.participants) ? row.participants : [],
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    duration: Number(row.duration || 0),
    messagesCount: row.messages_count && typeof row.messages_count === 'object' ? row.messages_count : {},
    ratings: Array.isArray(row.ratings) ? row.ratings : [],
    complaint: row.complaint && typeof row.complaint === 'object' ? row.complaint : null,
    waitingState: row.waiting_state && typeof row.waiting_state === 'object' ? row.waiting_state : null,
    disconnectionCount: row.disconnection_count && typeof row.disconnection_count === 'object' ? row.disconnection_count : {},
    preparationState: row.preparation_state && typeof row.preparation_state === 'object' ? row.preparation_state : null,
  };
}

async function getChatById(chatId) {
  const id = toId(chatId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function findActiveChatByParticipant(userId) {
  const uid = toId(userId);
  if (!uid) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('status', 'active')
    .contains('participants', [String(uid)])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function listActiveChats(limit = 500) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('status', 'active')
    .limit(Math.max(1, Math.min(2000, Number(limit) || 500)));
  if (error || !Array.isArray(data)) return [];
  return data.map(mapChatRow).filter(Boolean);
}

async function updateChatById(chatId, patch) {
  const id = toId(chatId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', String(id))
    .select('*')
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function getUserRowById(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,language,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function getUserLanguageFromRow(row) {
  if (!row) return 'ru';
  if (row.language) return String(row.language);
  const data = getUserData(row);
  if (data.language) return String(data.language);
  return 'ru';
}

async function updateUserDataById(userId, patch) {
  const id = toId(userId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(id);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,data,email,nickname,language')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

module.exports = {
  findActiveChatByParticipant,
  getChatById,
  getUserData,
  getUserLanguageFromRow,
  getUserRowById,
  listActiveChats,
  mapChatRow,
  toId,
  updateChatById,
  updateUserDataById,
};
