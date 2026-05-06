const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { createAdBoostOffer } = require('../services/adBoostService');

const DAILY_LIMIT = 10;
const MANUAL_REFERRAL_STEP_COUNT = 3;
const MANUAL_REFERRAL_PERCENT = 5;
const MANUAL_REFERRAL_HOURS = 24;

const generateReferralCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
};

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserData(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();
  const row = await getUserRowById(userId);
  if (!row) return null;
  const nowIso = new Date().toISOString();
  const existingData = row.data && typeof row.data === 'object' ? row.data : {};
  const nextData = { ...existingData, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: nextData, updated_at: nowIso })
    .eq('id', String(userId))
    .select('*')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function getShopBoosts(userData) {
  return userData?.shopBoosts && typeof userData.shopBoosts === 'object' ? userData.shopBoosts : {};
}

function normalizeManualSteps(value) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw
    .map((step) => Math.floor(Number(step) || 0))
    .filter((step) => step >= 1 && step <= MANUAL_REFERRAL_STEP_COUNT)))
    .sort((a, b) => a - b);
}

function getManualReferralStatus(userData, now = new Date()) {
  const shopBoosts = getShopBoosts(userData);
  const activeUntilRaw = String(shopBoosts.referralBlessingUntil || '').trim();
  const activeUntilMs = activeUntilRaw ? new Date(activeUntilRaw).getTime() : 0;
  const active = Number.isFinite(activeUntilMs) && activeUntilMs > now.getTime();
  const manual = shopBoosts.referralManualBoost && typeof shopBoosts.referralManualBoost === 'object'
    ? shopBoosts.referralManualBoost
    : {};
  const manuallyCompleted = Boolean(manual.completed);
  const watchedSteps = active || !manuallyCompleted ? normalizeManualSteps(manual.watchedSteps) : [];
  const completed = Boolean(active && (manuallyCompleted || watchedSteps.length >= MANUAL_REFERRAL_STEP_COUNT));
  return {
    stepsTotal: MANUAL_REFERRAL_STEP_COUNT,
    watchedSteps: completed ? [1, 2, 3] : watchedSteps,
    active,
    activeUntil: active ? new Date(activeUntilMs).toISOString() : null,
    percent: active
      ? Math.max(MANUAL_REFERRAL_PERCENT, Number(shopBoosts.referralBlessingPercent) || MANUAL_REFERRAL_PERCENT)
      : MANUAL_REFERRAL_PERCENT,
    completed,
  };
}

async function ensureUserReferralCode(userId) {
  const row = await getUserRowById(userId);
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  const current = String(data.referralCode || '').trim();
  if (current) return { row, code: current };

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

  const updated = await updateUserData(userId, { referralCode: code });
  return { row: updated || row, code };
}

async function getReferralByInviteeId(inviteeId) {
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

async function countReferralsByInviterSince({ inviterId, since }) {
  if (!inviterId || !since) return 0;
  const supabase = getSupabaseClient();
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();
  const { count, error } = await supabase
    .from('referrals')
    .select('id', { head: true, count: 'exact' })
    .eq('inviter_id', String(inviterId))
    .gte('created_at', sinceIso);
  if (error) return 0;
  return Math.max(0, Number(count) || 0);
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

async function sumReferralEarningsK({ userId }) {
  if (!userId) return 0;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', String(userId))
    .in('type', ['referral', 'referral_blessing'])
    .eq('direction', 'credit')
    .eq('currency', 'K');
  if (error || !Array.isArray(data)) return 0;
  return data.reduce((acc, row) => acc + (Number(row?.amount) || 0), 0);
}

async function getReferralInfo(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const ensured = await ensureUserReferralCode(userId);
    if (!ensured?.row) return res.status(404).json({ message: 'Пользователь не найден' });
    const row = ensured.row;
    const code = ensured.code;
    const userData = getUserData(row);

    const supabase = getSupabaseClient();
    const { count: totalInvitedRaw } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', String(userId));
    const totalInvited = Math.max(0, Number(totalInvitedRaw) || 0);

    const { data: referralRows } = await supabase
      .from('referrals')
      .select('*')
      .eq('inviter_id', String(userId))
      .order('created_at', { ascending: false })
      .limit(10);
    const list = Array.isArray(referralRows) ? referralRows : [];

    const inviteeIds = Array.from(new Set(list.map((r) => String(r?.invitee_id || '')).filter(Boolean)));
    let inviteesById = new Map();
    if (inviteeIds.length) {
      const { data: invitees } = await supabase
        .from('users')
        .select('id,nickname,status')
        .in('id', inviteeIds);
      inviteesById = new Map((Array.isArray(invitees) ? invitees : []).map((u) => [String(u.id), u]));
    }

    const activeCount = list.filter((r) => String(r?.status) === 'active').length;
    const totalEarned = await sumReferralEarningsK({ userId });

    return res.json({
      code,
      referredBy: userData.referredBy || null,
      totalInvited,
      activeCount,
      totalEarned,
      manualBoost: getManualReferralStatus(userData),
      referrals: list.map((r) => {
        const inv = inviteesById.get(String(r.invitee_id)) || null;
        return {
          nickname: inv?.nickname || 'Unknown',
          date: r.created_at,
          status: r.status,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
}

async function getManualBoostStatus(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });
    const userRow = await getUserRowById(userId);
    if (!userRow) return res.status(404).json({ message: 'Пользователь не найден' });
    return res.json(getManualReferralStatus(getUserData(userRow)));
  } catch (error) {
    return next(error);
  }
}

async function createManualBoostStep(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const step = Math.floor(Number(req.body?.step) || 0);
    if (step < 1 || step > MANUAL_REFERRAL_STEP_COUNT) {
      return res.status(400).json({ message: 'Некорректный шаг' });
    }

    const userRow = await getUserRowById(userId);
    if (!userRow) return res.status(404).json({ message: 'Пользователь не найден' });

    const userData = getUserData(userRow);
    const status = getManualReferralStatus(userData);
    if (status.active) {
      return res.status(400).json({ message: 'Реферальное усиление уже активно', status });
    }
    if (status.watchedSteps.includes(step)) {
      return res.status(400).json({ message: 'Этот шаг уже просмотрен', status });
    }

    const shopBoosts = getShopBoosts(userData);
    const manual = shopBoosts.referralManualBoost && typeof shopBoosts.referralManualBoost === 'object'
      ? shopBoosts.referralManualBoost
      : {};
    let cycleKey = String(manual.cycleKey || '').trim();
    if (!cycleKey || manual.completed) {
      cycleKey = `referral-manual:${String(userId)}:${Date.now()}`;
      shopBoosts.referralManualBoost = {
        cycleKey,
        watchedSteps: status.watchedSteps,
        completed: false,
        percent: MANUAL_REFERRAL_PERCENT,
        activeUntil: null,
      };
      await updateUserData(userId, { shopBoosts });
    }

    const boostOffer = await createAdBoostOffer({
      userId,
      type: 'referral_manual_step',
      contextKey: `${cycleKey}:step:${step}`,
      page: 'cabinet/referrals',
      title: `Шаг ${step}`,
      description: 'Досмотрите видео до конца, чтобы засчитать шаг.',
      reward: {
        kind: 'referral_manual_step',
        step,
        cycleKey,
      },
    });

    return res.json({
      boostOffer,
      status: getManualReferralStatus({ ...userData, shopBoosts }),
    });
  } catch (error) {
    return next(error);
  }
}

async function claimReferral(req, res, next) {
  try {
    const { code } = req.body || {};

    if (!code) {
      return res.status(400).json({ message: 'Нужен реферальный код' });
    }
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const userRow = await getUserRowById(userId);
    if (!userRow) return res.status(404).json({ message: 'Пользователь не найден' });
    const userData = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};
    if (userData.referredBy) {
      return res.status(400).json({ message: 'Реферальный код уже применён' });
    }

    const supabase = getSupabaseClient();
    const { data: inviter } = await supabase
      .from('users')
      .select('*')
      .eq('data->>referralCode', String(code).trim())
      .maybeSingle();
    if (!inviter) {
      return res.status(404).json({ message: 'Код не найден' });
    }
    if (String(inviter.id) === String(userId)) {
      return res.status(400).json({ message: 'Нельзя использовать свой код' });
    }

    const exists = await getReferralByInviteeId(userId);
    if (exists) {
      return res.status(400).json({ message: 'Код уже применён ранее' });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyCount = await countReferralsByInviterSince({ inviterId: inviter.id, since });

    let effectiveInviter = inviter;
    if (dailyCount >= DAILY_LIMIT) {
      const { data: spectator } = await supabase
        .from('users')
        .select('*')
        .eq('email', 'spectator@gmail.com')
        .maybeSingle();
      if (spectator) effectiveInviter = spectator;
    }

    const inviteeIp = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    const fingerprintHeader = req.headers['x-client-fingerprint'] || req.headers['x-device-id'] || '';
    const inviteeFingerprint =
      (fingerprintHeader && fingerprintHeader.toString()) ||
      crypto.createHash('sha256').update(req.headers['user-agent'] || '').digest('hex');

    const inviterData = effectiveInviter.data && typeof effectiveInviter.data === 'object'
      ? effectiveInviter.data
      : {};
    const inviterCode = String(inviterData.referralCode || '').trim() || String(code).trim();

    await createReferralRow({
      inviter_id: String(effectiveInviter.id),
      invitee_id: String(userId),
      code: inviterCode,
      invitee_ip: inviteeIp || null,
      invitee_fingerprint: inviteeFingerprint || null,
      bonus_granted: false,
      status: 'pending',
      check_reason: String(effectiveInviter.id) === String(inviter.id)
        ? null
        : `overflow_from:${String(inviter.id)}`,
    });

    await updateUserData(userId, { referredBy: String(effectiveInviter.id) });

    return res.json({
      ok: true,
      inviter: { id: effectiveInviter.id, nickname: effectiveInviter.nickname },
      bonus: 0,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getReferralInfo,
  claimReferral,
  getManualBoostStatus,
  createManualBoostStep,
};

