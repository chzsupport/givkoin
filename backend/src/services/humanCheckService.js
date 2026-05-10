const crypto = require('crypto');

const { getSupabaseClient } = require('../lib/supabaseClient');

const HUMAN_CHECK_VARIANTS = ['hold', 'slider', 'order', 'rotate', 'catch'];
const HUMAN_CHECK_INTERVAL_MS = Math.max(
  60 * 1000,
  Number(process.env.HUMAN_CHECK_INTERVAL_MS) || (60 * 60 * 1000),
);
const HUMAN_CHECK_BLOCK_MS = Math.max(
  60 * 1000,
  Number(process.env.HUMAN_CHECK_BLOCK_MS) || (60 * 60 * 1000),
);
const HUMAN_CHECK_MAX_ATTEMPTS = 3;

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function parseTimeMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeData(rowOrUser) {
  if (!rowOrUser || typeof rowOrUser !== 'object') return {};
  if (rowOrUser.data && typeof rowOrUser.data === 'object') return rowOrUser.data;
  return rowOrUser;
}

function normalizeHumanCheckState(rowOrUser) {
  const data = normalizeData(rowOrUser);
  const state = data.humanCheck && typeof data.humanCheck === 'object'
    ? data.humanCheck
    : {};
  return {
    lastPassedAt: state.lastPassedAt || '',
    nextRequiredAt: state.nextRequiredAt || '',
    blockedUntil: state.blockedUntil || '',
    lastFailedAt: state.lastFailedAt || '',
    lastVariant: state.lastVariant || '',
    active: state.active && typeof state.active === 'object' ? state.active : null,
  };
}

function isHumanCheckBlocked(rowOrUser, nowMs = Date.now()) {
  const state = normalizeHumanCheckState(rowOrUser);
  const blockedUntilMs = parseTimeMs(state.blockedUntil);
  return {
    blocked: Boolean(blockedUntilMs && blockedUntilMs > nowMs),
    blockedUntil: blockedUntilMs ? new Date(blockedUntilMs).toISOString() : '',
  };
}

function pickVariant() {
  const index = crypto.randomInt(0, HUMAN_CHECK_VARIANTS.length);
  return HUMAN_CHECK_VARIANTS[index];
}

function createChallenge(nowMs = Date.now()) {
  return {
    id: `hc_${nowMs}_${crypto.randomBytes(8).toString('hex')}`,
    variant: pickVariant(),
    attempts: 0,
    issuedAt: nowIso(nowMs),
  };
}

async function getUserRow(userId) {
  if (!userId) return null;
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('*')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function saveHumanCheckState(row, state) {
  if (!row?.id) return null;
  const currentData = row.data && typeof row.data === 'object' ? row.data : {};
  const nextData = {
    ...currentData,
    humanCheck: state,
  };
  const { data, error } = await getSupabaseClient()
    .from('users')
    .update({
      data: nextData,
      updated_at: nowIso(),
    })
    .eq('id', String(row.id))
    .select('*')
    .maybeSingle();
  if (error) return null;
  return data || { ...row, data: nextData };
}

async function getHumanCheckStatus(userId, nowMs = Date.now()) {
  const row = await getUserRow(userId);
  if (!row) {
    return { ok: false, status: 404 };
  }

  const state = normalizeHumanCheckState(row);
  const block = isHumanCheckBlocked(row, nowMs);
  if (block.blocked) {
    return {
      ok: true,
      blocked: true,
      blockedUntil: block.blockedUntil,
      required: false,
    };
  }

  const currentData = row.data && typeof row.data === 'object' ? row.data : {};
  const currentState = currentData.humanCheck && typeof currentData.humanCheck === 'object'
    ? { ...currentData.humanCheck }
    : {};

  let nextRequiredAtMs = parseTimeMs(state.nextRequiredAt);

  if (!nextRequiredAtMs) {
    const nextRequiredAt = nowIso(nowMs + HUMAN_CHECK_INTERVAL_MS);
    const nextState = {
      ...currentState,
      lastPassedAt: currentState.lastPassedAt || nowIso(nowMs),
      nextRequiredAt,
      blockedUntil: '',
      active: null,
    };
    await saveHumanCheckState(row, nextState);
    return {
      ok: true,
      blocked: false,
      required: false,
      nextRequiredAt,
    };
  }

  if (nextRequiredAtMs > nowMs) {
    return {
      ok: true,
      blocked: false,
      required: false,
      nextRequiredAt: new Date(nextRequiredAtMs).toISOString(),
    };
  }

  const active = state.active?.id ? state.active : createChallenge(nowMs);
  const nextState = {
    ...currentState,
    nextRequiredAt: currentState.nextRequiredAt || nowIso(nowMs),
    blockedUntil: '',
    active,
  };

  if (!state.active?.id) {
    await saveHumanCheckState(row, nextState);
  }

  const attempts = Math.max(0, Math.min(HUMAN_CHECK_MAX_ATTEMPTS, Number(active.attempts) || 0));
  return {
    ok: true,
    blocked: false,
    required: true,
    challengeId: active.id,
    variant: HUMAN_CHECK_VARIANTS.includes(active.variant) ? active.variant : 'hold',
    attemptsLeft: Math.max(0, HUMAN_CHECK_MAX_ATTEMPTS - attempts),
  };
}

async function completeHumanCheck({ userId, challengeId, variant }, nowMs = Date.now()) {
  const row = await getUserRow(userId);
  if (!row) return { ok: false, status: 404 };

  const state = normalizeHumanCheckState(row);
  const block = isHumanCheckBlocked(row, nowMs);
  if (block.blocked) {
    return {
      ok: true,
      blocked: true,
      blockedUntil: block.blockedUntil,
    };
  }

  const active = state.active;
  if (!active?.id || String(active.id) !== String(challengeId || '')) {
    return { ok: false, status: 400, reason: 'challenge_mismatch' };
  }

  if (variant && String(active.variant || '') !== String(variant || '')) {
    return { ok: false, status: 400, reason: 'variant_mismatch' };
  }

  const currentData = row.data && typeof row.data === 'object' ? row.data : {};
  const currentState = currentData.humanCheck && typeof currentData.humanCheck === 'object'
    ? { ...currentData.humanCheck }
    : {};
  const passedAt = nowIso(nowMs);
  const nextRequiredAt = nowIso(nowMs + HUMAN_CHECK_INTERVAL_MS);

  await saveHumanCheckState(row, {
    ...currentState,
    lastPassedAt: passedAt,
    nextRequiredAt,
    blockedUntil: '',
    lastVariant: active.variant || '',
    active: null,
  });

  return {
    ok: true,
    blocked: false,
    passedAt,
    nextRequiredAt,
  };
}

async function failHumanCheck({ userId, challengeId, variant }, nowMs = Date.now()) {
  const row = await getUserRow(userId);
  if (!row) return { ok: false, status: 404 };

  const state = normalizeHumanCheckState(row);
  const block = isHumanCheckBlocked(row, nowMs);
  if (block.blocked) {
    return {
      ok: true,
      blocked: true,
      blockedUntil: block.blockedUntil,
    };
  }

  const active = state.active;
  if (!active?.id || String(active.id) !== String(challengeId || '')) {
    return { ok: false, status: 400, reason: 'challenge_mismatch' };
  }

  if (variant && String(active.variant || '') !== String(variant || '')) {
    return { ok: false, status: 400, reason: 'variant_mismatch' };
  }

  const attempts = Math.max(0, Number(active.attempts) || 0) + 1;
  const currentData = row.data && typeof row.data === 'object' ? row.data : {};
  const currentState = currentData.humanCheck && typeof currentData.humanCheck === 'object'
    ? { ...currentData.humanCheck }
    : {};

  if (attempts >= HUMAN_CHECK_MAX_ATTEMPTS) {
    const blockedUntil = nowIso(nowMs + HUMAN_CHECK_BLOCK_MS);
    await saveHumanCheckState(row, {
      ...currentState,
      blockedUntil,
      lastFailedAt: nowIso(nowMs),
      active: null,
    });
    return {
      ok: true,
      blocked: true,
      blockedUntil,
      attemptsLeft: 0,
    };
  }

  const nextActive = {
    ...active,
    attempts,
    lastFailedAt: nowIso(nowMs),
  };
  await saveHumanCheckState(row, {
    ...currentState,
    blockedUntil: '',
    active: nextActive,
  });

  return {
    ok: true,
    blocked: false,
    attemptsLeft: Math.max(0, HUMAN_CHECK_MAX_ATTEMPTS - attempts),
  };
}

module.exports = {
  HUMAN_CHECK_MAX_ATTEMPTS,
  HUMAN_CHECK_INTERVAL_MS,
  HUMAN_CHECK_BLOCK_MS,
  getHumanCheckStatus,
  completeHumanCheck,
  failHumanCheck,
  isHumanCheckBlocked,
};
