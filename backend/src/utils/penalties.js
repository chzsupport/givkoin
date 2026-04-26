const DEBUFF_DURATION_HOURS = 72;
const { getSupabaseClient } = require('../lib/supabaseClient');

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function isComplaintBlocked(user = {}) {
  if (!user.complaintBlockedUntil) return false;
  return new Date(user.complaintBlockedUntil) > new Date();
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

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function applyPenalty(user) {
  const userId = toId(user);
  if (!userId) {
    throw new Error('User is required for applyPenalty');
  }

  const row = await getUserRowById(userId);
  if (!row) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const data = getUserData(row);
  const nextBanCount = (Number(data.banCount) || 0) + 1;

  // Stars: every confirmed ban
  const currentStars = typeof data.stars === 'number' ? data.stars : Number(data.stars) || 0;
  const nextStars = Math.max(0.01, (currentStars || 0) - 0.1);

  // Lives: from 2nd ban and далее
  const currentLives = Number(data.lives) || 0;
  const nextLives = nextBanCount >= 2 ? Math.max(0, currentLives - 1) : currentLives;

  // Debuff: from 2nd ban and далее, accumulative if still active
  const now = new Date();
  const currentDebuffPercent = Number(data.debuffPercent) || 0;
  const isStillActive = data.debuffActiveUntil && new Date(data.debuffActiveUntil) > now;
  const baseDebuffPercent = isStillActive ? currentDebuffPercent : 0;
  const debuffDelta = nextBanCount >= 2 ? 5 : 0;
  const nextDebuffPercent = debuffDelta > 0 ? Math.min(100, baseDebuffPercent + debuffDelta) : (Number(data.debuffPercent) || 0);
  const nextDebuffActiveUntil = hoursFromNow(DEBUFF_DURATION_HOURS).toISOString();

  await updateUserDataById(userId, {
    banCount: nextBanCount,
    stars: nextStars,
    lives: nextLives,
    debuffPercent: nextDebuffPercent,
    debuffActiveUntil: nextDebuffActiveUntil,
  });

  return {
    banNumber: nextBanCount,
    debuffPercent: nextDebuffPercent,
    lives: nextLives,
    stars: nextStars,
    debuffActiveUntil: nextDebuffActiveUntil,
  };
}

module.exports = {
  isComplaintBlocked,
  applyPenalty,
  hoursFromNow,
};
