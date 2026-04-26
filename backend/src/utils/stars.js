const { getSupabaseClient } = require('../lib/supabaseClient');
const { creditSc, getTotalRewardMultiplier, recordTransaction } = require('../services/scService');
const emailService = require('../services/emailService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
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
    .select('id,data,email,nickname')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

const STARS_SCALE = 1000;
const STARS_MAX = 5 * STARS_SCALE;
const STARS_MIN = Math.round(0.01 * STARS_SCALE);

const STAR_MILESTONES = [2, 3, 4, 5];
const STAR_MILESTONE_SC = 1000;
const STAR_MAX_BONUS_SC = 5000;

function toMilli(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * STARS_SCALE);
}

function fromMilli(milli) {
  return milli / STARS_SCALE;
}

function clampMilli(milli) {
  if (!Number.isFinite(milli)) return STARS_MIN;
  return Math.min(STARS_MAX, Math.max(STARS_MIN, milli));
}

function normalizeStars(value) {
  const milli = clampMilli(toMilli(value));
  return fromMilli(milli);
}

async function applyStarsDelta({
  userId,
  delta,
  skipDebuff = false,
  type = 'stars',
  description = null,
  relatedEntity = null,
  occurredAt = new Date(),
}) {
  const safeDelta = Number(delta) || 0;
  const rewardMultiplier = safeDelta > 0 && !skipDebuff
    ? await getTotalRewardMultiplier(userId)
    : 1;
  const effectiveDelta = safeDelta > 0
    ? Math.round(safeDelta * rewardMultiplier * 1000) / 1000
    : safeDelta;

  const userRow = await getUserRowById(userId);
  if (!userRow) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const userData = getUserData(userRow);

  const currentMilli = toMilli(userData.stars);
  const deltaMilli = toMilli(effectiveDelta);
  let nextMilli = clampMilli(currentMilli + deltaMilli);

  const isIncreasing = deltaMilli > 0;

  // Critical minimum: on second fall to 0.01 require recovery
  const reachedCriticalMin = nextMilli <= STARS_MIN;
  const wasAboveMin = currentMilli > STARS_MIN;
  if (reachedCriticalMin) {
    nextMilli = STARS_MIN;
    if (wasAboveMin) {
      const currentHits = Math.max(0, Number(userData.starsCriticalHits) || 0) + 1;
      const recoveryRequired = Boolean(userData.starsRecoveryRequired);
      const patch = { starsCriticalHits: currentHits };
      if (currentHits >= 2 && !recoveryRequired) {
        patch.starsRecoveryRequired = true;
        patch.starsRecoveryStartedAt = new Date().toISOString();
      }
      await updateUserDataById(userId, patch);
    }
  }

  async function countNewsInteractions(userId, type, since) {
    const supabase = getSupabaseClient();
    const sinceIso = since instanceof Date ? since.toISOString() : since;
    const { count, error } = await supabase
      .from(DOC_TABLE)
      .select('id', { head: true, count: 'exact' })
      .eq('model', 'NewsInteraction')
      .eq('data->>user', String(userId))
      .eq('data->>type', String(type))
      .gte('created_at', sinceIso);
    if (error) return 0;
    return Math.max(0, Number(count) || 0);
  }

  async function hasCompletedRecovery() {
    const fresh = await getUserRowById(userId);
    if (!fresh) return false;
    const freshData = getUserData(fresh);
    if (!freshData.starsRecoveryRequired) return true;
    const since = freshData.starsRecoveryStartedAt ? new Date(freshData.starsRecoveryStartedAt) : new Date(0);

    const supabase = getSupabaseClient();
    const sinceIso = since.toISOString();

    const [referrals, reposts, comments, solarCollects, battles] = await Promise.all([
      (async () => {
        const { count, error } = await supabase
          .from('referrals')
          .select('id', { head: true, count: 'exact' })
          .eq('inviter_id', String(userId))
          .gte('confirmed_at', sinceIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      countNewsInteractions(userId, 'repost', since),
      countNewsInteractions(userId, 'comment', since),
      (async () => {
        const { count, error } = await supabase
          .from('activity_logs')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', String(userId))
          .eq('type', 'solar_collect')
          .gte('created_at', sinceIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('activity_logs')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', String(userId))
          .eq('type', 'battle_participation')
          .gte('created_at', sinceIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
    ]);

    return referrals >= 10 && reposts >= 10 && comments >= 10 && solarCollects >= 10 && battles >= 1;
  }

  const recoveryRequiredNow = Boolean(getUserData(await getUserRowById(userId))?.starsRecoveryRequired);
  if (recoveryRequiredNow && currentMilli <= STARS_MIN && isIncreasing) {
    const ok = await hasCompletedRecovery();
    if (!ok) {
      await updateUserDataById(userId, { stars: fromMilli(STARS_MIN) });
      return { stars: fromMilli(STARS_MIN), recoveryRequired: true };
    }
    await updateUserDataById(userId, { starsRecoveryRequired: false, starsRecoveryStartedAt: null });
  }

  const before = fromMilli(currentMilli);
  const after = fromMilli(nextMilli);

  let patchAfter = { stars: after };

  // #95. Никогда не сдаваться (2 -> 4)
  try {
    const currentStats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};
    const currentPath = currentStats?.starsPath || null;
    let nextPath = currentPath;

    if (after >= 4) {
      if (!currentPath) {
        nextPath = 'reached_4';
      } else if (currentPath === 'dropped_to_2') {
        const { grantAchievement } = require('../services/achievementService');
        await grantAchievement({ userId, achievementId: 95 });
        nextPath = 'reached_4_again';
      }
    } else if (after <= 2) {
      if (currentPath === 'reached_4') {
        nextPath = 'dropped_to_2';
      }
    }

    if (nextPath !== currentPath) {
      patchAfter.achievementStats = { ...currentStats, starsPath: nextPath };
    }
  } catch (e) {
    console.error('Achievement #95 error:', e);
  }

  // Milestone rewards: 2/3/4/5 -> +1000 K and email. Extra +5000 K at 5.
  const awarded = Array.isArray(userData.starsMilestonesAwarded) ? userData.starsMilestonesAwarded : [];
  const newlyAwarded = [];

  for (const m of STAR_MILESTONES) {
    if (before < m && after >= m && !awarded.includes(m)) {
      newlyAwarded.push(m);
    }
  }

  if (newlyAwarded.length) {
    patchAfter.starsMilestonesAwarded = Array.from(new Set([...awarded, ...newlyAwarded]));
  }

  const saved = await updateUserDataById(userId, patchAfter);
  const savedData = getUserData(saved);

  if (effectiveDelta !== 0) {
    await recordTransaction({
      userId,
      type: String(type || 'stars'),
      direction: effectiveDelta > 0 ? 'credit' : 'debit',
      amount: Math.abs(effectiveDelta),
      currency: 'STAR',
      description: description || (effectiveDelta > 0 ? 'Начисление звёзд' : 'Списание звёзд'),
      relatedEntity,
      occurredAt,
    }).catch(() => null);
  }

  if (newlyAwarded.length) {
    for (const m of newlyAwarded) {
      await creditSc({
        userId,
        amount: STAR_MILESTONE_SC,
        type: 'stars',
        description: `Награда за достижение ${m} звезды`,
        relatedEntity: userId,
      });

      if (m === 5) {
        await creditSc({
          userId,
          amount: STAR_MAX_BONUS_SC,
          type: 'stars',
          description: 'Бонус за 5 звёзд',
          relatedEntity: userId,
        });
      }

      const email = String(saved?.email || userRow?.email || '').trim();
      const nickname = String(saved?.nickname || userRow?.nickname || '').trim();
      const userLang = (saved?.language || saved?.data?.language || userRow?.language || userRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
      if (email) {
        await emailService.sendStarsMilestoneEmail(email, nickname, { stars: m }, userLang).catch(() => { });
      }
    }
  }

  return { stars: Number(savedData.stars) || after };
}

module.exports = {
  normalizeStars,
  applyStarsDelta,
  STARS_SCALE,
};

