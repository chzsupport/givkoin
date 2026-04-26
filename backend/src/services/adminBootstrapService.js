const {
  isAdminEmail,
  getEmailPolicyMessage,
} = require('../utils/accountRole');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getSupabaseClient } = require('../lib/supabaseClient');

function validateSeedPhrase24(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length === 24;
}

function extractNicknameFromEmail(email) {
  const safeEmail = String(email || '').trim().toLowerCase();
  const at = safeEmail.indexOf('@');
  return (at > 0 ? safeEmail.slice(0, at) : safeEmail).trim();
}

function generateUserId() {
  return crypto.randomBytes(12).toString('hex');
}

async function countAdmins() {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) throw error;
  return Number(count || 0);
}

async function bootstrapInitialAdmin({ email, seedPhrase }) {
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeSeedPhrase = String(seedPhrase || '').trim();

  if (!safeEmail) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is required');
  }
  if (!isAdminEmail(safeEmail)) {
    throw new Error(getEmailPolicyMessage('admin'));
  }
  if (!validateSeedPhrase24(safeSeedPhrase)) {
    throw new Error('BOOTSTRAP_ADMIN_SEED_PHRASE must contain 24 words');
  }

  const existingAdmins = await countAdmins();
  if (existingAdmins > 0) {
    return { created: false, reason: 'admins_already_exist' };
  }

  const supabase = getSupabaseClient();
  const { data: existingEmail, error: emailError } = await supabase
    .from('users')
    .select('id')
    .eq('email', safeEmail)
    .maybeSingle();
  if (emailError) throw emailError;
  if (existingEmail) throw new Error('BOOTSTRAP_ADMIN_EMAIL is already in use');

  const nickname = extractNicknameFromEmail(safeEmail);
  if (!nickname) {
    throw new Error('Cannot derive nickname from BOOTSTRAP_ADMIN_EMAIL');
  }

  const { data: existingNickname, error: nickError } = await supabase
    .from('users')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();
  if (nickError) throw nickError;
  if (existingNickname) throw new Error('Derived admin nickname is already in use');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(safeSeedPhrase, salt);
  const nowIso = new Date().toISOString();
  const adminId = generateUserId();

  const { data: admin, error: insertError } = await supabase
    .from('users')
    .insert({
      id: adminId,
      email: safeEmail,
      password_hash: passwordHash,
      role: 'admin',
      nickname,
      status: 'active',
      email_confirmed: true,
      email_confirmed_at: nowIso,
      access_restricted_until: null,
      access_restriction_reason: '',
      language: 'ru',
      data: {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id,email')
    .maybeSingle();
  if (insertError || !admin) throw (insertError || new Error('Failed to create bootstrap admin'));

  return { created: true, adminId: String(admin.id), email: admin.email };
}

async function ensureBootstrapAdminFromEnv(logger = console) {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim();
  const seedPhrase = String(process.env.BOOTSTRAP_ADMIN_SEED_PHRASE || '').trim();

  if (!email || !seedPhrase) {
    return { created: false, reason: 'env_not_configured' };
  }

  const result = await bootstrapInitialAdmin({ email, seedPhrase });
  if (result.created) {
    logger.info?.('[AUTH] Initial admin created from bootstrap env', { email: result.email });
  }
  return result;
}

module.exports = {
  validateSeedPhrase24,
  extractNicknameFromEmail,
  bootstrapInitialAdmin,
  ensureBootstrapAdminFromEnv,
};
