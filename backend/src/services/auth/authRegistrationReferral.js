const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { generateReferralCode: defaultGenerateReferralCode } = require('./authHelpers');
const {
  countReferralsByInviterSince: defaultCountReferralsByInviterSince,
  createReferralRow: defaultCreateReferralRow,
  getUserRowByEmail: defaultGetUserRowByEmail,
  getUserRowByNicknameCaseInsensitive: defaultGetUserRowByNicknameCaseInsensitive,
} = require('./authReferralStore');

const DEFAULT_OVERFLOW_EMAIL = 'spectator@gmail.com';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function createAuthRegistrationReferral({
  countReferralsByInviterSince = defaultCountReferralsByInviterSince,
  createReferralRow = defaultCreateReferralRow,
  generateReferralCode = defaultGenerateReferralCode,
  getSupabaseClient = defaultGetSupabaseClient,
  getUserRowByEmail = defaultGetUserRowByEmail,
  getUserRowByNicknameCaseInsensitive = defaultGetUserRowByNicknameCaseInsensitive,
  now = () => new Date(),
} = {}) {
  async function resolveRegistrationReferral({
    referralCode,
    dailyLimit = 10,
    overflowEmail = DEFAULT_OVERFLOW_EMAIL,
  } = {}) {
    const normalizedReferralCode = String(referralCode || '').trim();

    if (!normalizedReferralCode) {
      return { referredBy: undefined, referralOverflowFrom: undefined };
    }

    const referrer = await getUserRowByNicknameCaseInsensitive(normalizedReferralCode);

    if (!referrer) {
      return { referredBy: undefined, referralOverflowFrom: undefined };
    }

    let referralInviter = referrer;
    let referralOverflowFrom;
    const since = new Date(new Date(now()).getTime() - ONE_DAY_MS);
    const dailyCount = await countReferralsByInviterSince({ inviterId: referrer.id, since });

    if (dailyCount >= dailyLimit) {
      const spectator = await getUserRowByEmail(overflowEmail);

      if (spectator) {
        referralInviter = spectator;
        referralOverflowFrom = referrer.id;
      }
    }

    return {
      referredBy: referralInviter.id,
      referralOverflowFrom,
    };
  }

  async function ensureInviterReferralCode(inviterRow) {
    if (!inviterRow) return '';

    const supabase = getSupabaseClient();
    const inviterData = inviterRow.data && typeof inviterRow.data === 'object' ? inviterRow.data : {};
    let inviterReferralCode = String(inviterData.referralCode || '').trim();

    if (inviterReferralCode) {
      return inviterReferralCode;
    }

    let code;
    let exists = true;

    while (exists) {
      code = generateReferralCode();

      // eslint-disable-next-line no-await-in-loop
      const { data: refCheck } = await supabase
        .from('users')
        .select('id')
        .eq('data->>referralCode', String(code))
        .maybeSingle();

      exists = Boolean(refCheck);
    }

    inviterReferralCode = code;

    await supabase
      .from('users')
      .update({
        data: { ...inviterData, referralCode: inviterReferralCode },
        updated_at: new Date(now()).toISOString(),
      })
      .eq('id', String(inviterRow.id));

    return inviterReferralCode;
  }

  async function createPendingReferralForNewUser({
    referredBy,
    createdUserId,
    inviteeIp,
    inviteeFingerprint,
    referralOverflowFrom,
  } = {}) {
    if (!referredBy || !createdUserId) {
      return null;
    }

    const supabase = getSupabaseClient();
    const inviter = await supabase
      .from('users')
      .select('*')
      .eq('id', String(referredBy))
      .maybeSingle();
    const inviterRow = inviter?.data || null;

    if (!inviterRow) {
      return null;
    }

    const inviterReferralCode = await ensureInviterReferralCode(inviterRow);

    return createReferralRow({
      inviter_id: inviterRow.id,
      invitee_id: createdUserId,
      code: inviterReferralCode,
      invitee_ip: inviteeIp || null,
      invitee_fingerprint: inviteeFingerprint || null,
      bonus_granted: false,
      status: 'pending',
      check_reason: referralOverflowFrom ? `overflow_from:${String(referralOverflowFrom)}` : null,
    });
  }

  return {
    createPendingReferralForNewUser,
    ensureInviterReferralCode,
    resolveRegistrationReferral,
  };
}

module.exports = {
  ...createAuthRegistrationReferral(),
  createAuthRegistrationReferral,
};
