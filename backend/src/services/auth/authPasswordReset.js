const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const {
  buildLocalizedFrontendUrl: defaultBuildLocalizedFrontendUrl,
  normalizeEmailInput: defaultNormalizeEmailInput,
} = require('./authHelpers');
const {
  getUserRowByEmail: defaultGetUserRowByEmail,
} = require('./authReferralStore');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function hashSeedPhrase(seedPhrase) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(seedPhrase || ''), salt);
}

async function defaultSendPasswordRecoveryEmail(...args) {
  // Load email service only when the real sender is needed.
  // Tests can inject a sender without triggering mail transport setup.
  // eslint-disable-next-line global-require
  const emailService = require('../emailService');
  return emailService.sendPasswordRecoveryEmail(...args);
}

function createAuthPasswordReset({
  buildLocalizedFrontendUrl = defaultBuildLocalizedFrontendUrl,
  createToken = createResetToken,
  getSupabaseClient = defaultGetSupabaseClient,
  getUserRowByEmail = defaultGetUserRowByEmail,
  hashPassword = hashSeedPhrase,
  hashToken = hashResetToken,
  normalizeEmailInput = defaultNormalizeEmailInput,
  now = () => new Date(),
  sendPasswordRecoveryEmail = defaultSendPasswordRecoveryEmail,
} = {}) {
  async function requestPasswordReset({ userRow, language }) {
    if (!userRow) return null;

    const resetToken = createToken();
    const resetTokenHash = hashToken(resetToken);
    const nowDate = new Date(now());
    const nowIso = nowDate.toISOString();
    const expiresAt = new Date(nowDate.getTime() + RESET_TOKEN_TTL_MS).toISOString();
    const existingData = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};

    await getSupabaseClient()
      .from('users')
      .update({
        updated_at: nowIso,
        data: {
          ...existingData,
          resetPasswordTokenHash: resetTokenHash,
          resetPasswordExpiresAt: expiresAt,
        },
      })
      .eq('id', String(userRow.id));

    const resetUrl = buildLocalizedFrontendUrl(language, 'reset-password', `token=${encodeURIComponent(resetToken)}`);

    await sendPasswordRecoveryEmail(userRow.email, userRow.nickname, resetUrl, language);

    return {
      resetToken,
      resetUrl,
    };
  }

  async function requestPasswordResetByEmail({ email, language } = {}) {
    const userRow = await getUserRowByEmail(normalizeEmailInput(email));

    if (!userRow) {
      return { ok: false, reason: 'not_found' };
    }

    const resetResult = await requestPasswordReset({ userRow, language });

    return {
      ok: true,
      resetToken: resetResult?.resetToken,
      resetUrl: resetResult?.resetUrl,
    };
  }

  async function resetPasswordWithToken({ token, seedPhrase }) {
    const resetTokenHash = hashToken(token);
    const supabase = getSupabaseClient();
    const { data: row, error } = await supabase
      .from('users')
      .select('*')
      .eq('data->>resetPasswordTokenHash', String(resetTokenHash))
      .maybeSingle();

    if (error || !row) {
      return { ok: false, reason: 'invalid_token' };
    }

    const data = row.data && typeof row.data === 'object' ? row.data : {};
    const expiresAtRaw = data.resetPasswordExpiresAt;
    const expiresAtMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;

    if (!expiresAtMs || new Date(now()).getTime() > expiresAtMs) {
      return { ok: false, reason: 'invalid_token' };
    }

    const passwordHash = await hashPassword(seedPhrase);
    const nextData = { ...data };
    delete nextData.resetPasswordTokenHash;
    delete nextData.resetPasswordExpiresAt;

    await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: new Date(now()).toISOString(),
        data: nextData,
      })
      .eq('id', String(row.id));

    return { ok: true, userId: row.id };
  }

  return {
    requestPasswordReset,
    requestPasswordResetByEmail,
    resetPasswordWithToken,
  };
}

module.exports = {
  ...createAuthPasswordReset(),
  createAuthPasswordReset,
  hashResetToken,
};
