const { getSupabaseClient } = require('../lib/supabaseClient');

function startOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return startOfDayLocal(a).getTime() === startOfDayLocal(b).getTime();
}

function getDayKey(date) {
  return startOfDayLocal(date).toISOString().slice(0, 10);
}

function buildClaimId(userId, dateKey) {
  return `personal_luck:${String(userId || '').trim()}:${String(dateKey || '').trim()}`;
}

async function hasClaimedPersonalLuckToday({ userId, now = new Date(), fallbackLastLuckyDrawAt = null }) {
  if (!userId) return false;
  if (fallbackLastLuckyDrawAt && isSameLocalDay(fallbackLastLuckyDrawAt, now)) return true;

  const dateKey = getDayKey(now);
  const claimId = buildClaimId(userId, dateKey);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('personal_luck_claims')
    .select('claim_id')
    .eq('claim_id', claimId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function reservePersonalLuckClaim({ userId, now = new Date(), fallbackLastLuckyDrawAt = null }) {
  if (!userId) {
    const err = new Error('userId is required');
    err.status = 400;
    throw err;
  }

  if (fallbackLastLuckyDrawAt && isSameLocalDay(fallbackLastLuckyDrawAt, now)) {
    return { ok: false, reason: 'already_claimed', dateKey: getDayKey(now) };
  }

  const dateKey = getDayKey(now);
  const claimId = buildClaimId(userId, dateKey);

  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date(now).toISOString();
    const { error } = await supabase
      .from('personal_luck_claims')
      .insert({
        claim_id: claimId,
        user_id: String(userId),
        date_key: dateKey,
        claimed_at: nowIso,
        amount: 0,
        reward_label: '',
        currency: 'K',
        finalized_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    if (error) throw error;
    return { ok: true, claimId, dateKey };
  } catch (error) {
    if (String(error?.code || '') === '23505') {
      return { ok: false, reason: 'already_claimed', claimId, dateKey };
    }
    throw error;
  }
}

async function finalizePersonalLuckClaim({ claimId, amount, rewardLabel, finalizedAt = new Date() }) {
  if (!claimId) return null;

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('personal_luck_claims')
    .update({
      amount: Math.max(0, Number(amount) || 0),
      reward_label: String(rewardLabel || '').trim(),
      finalized_at: finalizedAt ? new Date(finalizedAt).toISOString() : null,
      updated_at: nowIso,
    })
    .eq('claim_id', String(claimId))
    .select('claim_id,user_id,date_key,claimed_at,amount,reward_label,currency,finalized_at')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function rollbackPersonalLuckClaim({ claimId }) {
  if (!claimId) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('personal_luck_claims')
    .delete()
    .eq('claim_id', String(claimId));
  if (error) throw error;
}

module.exports = {
  startOfDayLocal,
  isSameLocalDay,
  getDayKey,
  buildClaimId,
  hasClaimedPersonalLuckToday,
  reservePersonalLuckClaim,
  finalizePersonalLuckClaim,
  rollbackPersonalLuckClaim,
};

