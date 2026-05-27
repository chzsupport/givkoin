const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');

const DAILY_REFERRAL_BONUS_DESCRIPTIONS = new Set([
  'Бонус за 10-го реферала за сутки',
  '10th referral bonus for the day',
]);

function toIsoDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isReferralRewardDescription(description) {
  const normalized = String(description || '').trim();

  return normalized.startsWith('Бонус за реферала:')
    || normalized.startsWith('Referral bonus:');
}

function createAuthReferralStore({
  getSupabaseClient = defaultGetSupabaseClient,
} = {}) {
  async function getUserRowByEmail(email) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', String(email || '').trim().toLowerCase())
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  async function countReferralsByInviterSince({ inviterId, since }) {
    if (!inviterId || !since) return 0;

    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', String(inviterId))
      .gte('created_at', toIsoDate(since));

    if (error) return 0;
    return Math.max(0, Number(count) || 0);
  }

  async function countConfirmedReferralsByInviterSince({ inviterId, since }) {
    if (!inviterId || !since) return 0;

    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', String(inviterId))
      .gte('confirmed_at', toIsoDate(since));

    if (error) return 0;
    return Math.max(0, Number(count) || 0);
  }

  async function findReferralByInviteeId(inviteeId) {
    if (!inviteeId) return null;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('invitee_id', String(inviteeId))
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  async function createReferralRow(payload) {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('referrals')
      .insert({
        ...payload,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  async function confirmReferral({ referralId }) {
    if (!referralId) return null;

    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('referrals')
      .update({
        confirmed_at: nowIso,
        bonus_granted: false,
        status: 'pending',
        updated_at: nowIso,
      })
      .eq('id', Number(referralId))
      .select('*')
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  async function hasTransactionDailyReferralBonus({ userId, since }) {
    if (!userId || !since) return false;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('transactions')
      .select('id,description')
      .eq('user_id', String(userId))
      .eq('type', 'referral')
      .eq('direction', 'credit')
      .eq('currency', 'K')
      .gte('occurred_at', toIsoDate(since))
      .limit(100);

    if (error) return false;
    return Array.isArray(data) && data.some((row) => (
      DAILY_REFERRAL_BONUS_DESCRIPTIONS.has(String(row?.description || '').trim())
    ));
  }

  async function hasReferralRewardKTransaction({ userId, referralId }) {
    if (!userId || !referralId) return false;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('transactions')
      .select('id,description')
      .eq('user_id', String(userId))
      .eq('type', 'referral')
      .eq('direction', 'credit')
      .eq('currency', 'K')
      .eq('related_entity', String(referralId))
      .limit(100);

    if (error) return false;
    return Array.isArray(data) && data.some((row) => isReferralRewardDescription(row?.description));
  }

  async function countReferralRewardTransactionsSince({ userId, since }) {
    if (!userId || !since) return 0;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('transactions')
      .select('description')
      .eq('user_id', String(userId))
      .eq('type', 'referral')
      .eq('direction', 'credit')
      .eq('currency', 'K')
      .gte('occurred_at', toIsoDate(since));

    if (error) return 0;
    return Math.max(0, (Array.isArray(data) ? data : [])
      .filter((row) => isReferralRewardDescription(row?.description))
      .length);
  }

  async function getUserRowByNicknameCaseInsensitive(nickname) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('nickname', String(nickname || '').trim())
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  return {
    countConfirmedReferralsByInviterSince,
    countReferralRewardTransactionsSince,
    countReferralsByInviterSince,
    confirmReferral,
    createReferralRow,
    findReferralByInviteeId,
    getUserRowByEmail,
    getUserRowByNicknameCaseInsensitive,
    hasReferralRewardKTransaction,
    hasTransactionDailyReferralBonus,
  };
}

module.exports = {
  ...createAuthReferralStore(),
  createAuthReferralStore,
  isReferralRewardDescription,
};
