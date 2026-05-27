const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { getNumericSettingValue: defaultGetNumericSettingValue } = require('../settingsRegistryService');
const { generateReferralCode: defaultGenerateReferralCode } = require('./authHelpers');
const {
  confirmReferral: defaultConfirmReferral,
  findReferralByInviteeId: defaultFindReferralByInviteeId,
  getUserRowByEmail: defaultGetUserRowByEmail,
} = require('./authReferralStore');

function numberFromEnv(name, fallback) {
  return Number(process.env[name] ?? fallback) || fallback;
}

function createAuthEmailConfirmation({
  confirmReferral = defaultConfirmReferral,
  findReferralByInviteeId = defaultFindReferralByInviteeId,
  generateReferralCode = defaultGenerateReferralCode,
  getNumericSettingValue = defaultGetNumericSettingValue,
  getSupabaseClient = defaultGetSupabaseClient,
  getUserRowByEmail = defaultGetUserRowByEmail,
  now = () => new Date(),
} = {}) {
  async function findConfirmationUserRow(decoded = {}) {
    const userRow = await getUserRowByEmail(decoded?.email || '');
    const userById = decoded?.userId
      ? await getSupabaseClient().from('users').select('*').eq('id', String(decoded.userId)).maybeSingle()
      : null;

    return userById?.data || userRow;
  }

  async function ensureUniqueReferralCode(existingReferralCode) {
    const currentCode = String(existingReferralCode || '').trim();

    if (currentCode) {
      return currentCode;
    }

    const supabase = getSupabaseClient();
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

    return code;
  }

  async function activateConfirmedEmail(row) {
    if (!row) return null;

    const supabase = getSupabaseClient();
    const nowIso = new Date(now()).toISOString();
    const lives = await getNumericSettingValue('INITIAL_LIVES', numberFromEnv('INITIAL_LIVES', 5));
    const complaintChips = numberFromEnv('INITIAL_COMPLAINT_CHIPS', 15);
    const stars = numberFromEnv('INITIAL_STARS', 1);
    const k = numberFromEnv('INITIAL_K', 0);
    const lumens = numberFromEnv('INITIAL_LUMENS', 0);
    const existingData = row.data && typeof row.data === 'object' ? row.data : {};
    const referralCodeValue = await ensureUniqueReferralCode(existingData.referralCode);

    await supabase
      .from('users')
      .update({
        email_confirmed: true,
        email_confirmed_at: nowIso,
        status: 'active',
        updated_at: nowIso,
        data: {
          ...existingData,
          lives,
          complaintChips,
          stars,
          k,
          lumens,
          referralCode: referralCodeValue,
        },
      })
      .eq('id', String(row.id));

    const existingReferral = await findReferralByInviteeId(row.id);

    if (existingReferral && !existingReferral.confirmed_at) {
      await confirmReferral({ referralId: existingReferral.id });
    }

    return { referralCode: referralCodeValue };
  }

  return {
    activateConfirmedEmail,
    ensureUniqueReferralCode,
    findConfirmationUserRow,
  };
}

module.exports = {
  ...createAuthEmailConfirmation(),
  createAuthEmailConfirmation,
};
