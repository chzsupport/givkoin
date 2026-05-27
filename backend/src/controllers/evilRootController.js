const { applyStarsDelta } = require('../utils/stars');
const { recordActivity } = require('../services/activityService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const {
  getDocByModelAndId,
  insertDoc,
  listDocsByModel,
  updateDocByModel,
} = require('../services/documentStore');
const {
  EVIL_ROOT_DAILY_SESSIONS,
} = require('../config/constants');

async function findEvilRootSession(userId, sessionId) {
  const rows = await listDocsByModel('EvilRootSession', {
    limit: 1,
    dataEq: {
      user: String(userId),
      sessionId: String(sessionId),
    },
  });
  const found = rows[0] || null;
  return found ? { id: found._id, data: found } : null;
}

async function upsertEvilRootSession(userId, sessionId, dateKey, doc) {
  const existing = await findEvilRootSession(userId, sessionId);

  if (existing) {
    const nextData = { ...existing.data, ...doc };
    try {
      await updateDocByModel('EvilRootSession', existing.id, nextData);
    } catch (_error) {
      // keep the old best-effort behavior
    }
    return { _id: existing.id, ...nextData };
  }

  const id = `ers_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const newData = {
    user: userId,
    sessionId,
    dateKey,
    symbols: 0,
    messages: 0,
    starsAwarded: 0,
    radianceAwarded: 0,
    radianceUnitsAwarded: 0,
    ...doc,
  };
  try {
    await insertDoc({ model: 'EvilRootSession', id, data: newData });
  } catch (_error) {
    // keep the old best-effort behavior
  }
  return { _id: id, ...newData };
}

async function findEvilRootDaily(userId, dateKeyVal) {
  const rows = await listDocsByModel('EvilRootDaily', {
    limit: 1,
    dataEq: {
      user: String(userId),
      dateKey: String(dateKeyVal),
    },
  });
  const found = rows[0] || null;
  return found ? { id: found._id, data: found } : null;
}

async function upsertEvilRootDaily(userId, dateKeyVal) {
  const existing = await findEvilRootDaily(userId, dateKeyVal);

  if (existing) {
    return { _id: existing.id, ...existing.data };
  }

  const id = `erd_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const newData = {
    user: userId,
    dateKey: dateKeyVal,
    sessionsRewarded: 0,
    radianceRewardsCount: 0,
  };
  try {
    await insertDoc({ model: 'EvilRootDaily', id, data: newData });
  } catch (_error) {
    // keep the old best-effort behavior
  }
  return { _id: id, ...newData };
}

async function incrementEvilRootDailySessionsRewarded(dailyId) {
  const existing = await getDocByModelAndId('EvilRootDaily', dailyId);
  if (!existing) return null;

  const nextData = { ...existing, sessionsRewarded: (Number(existing?.sessionsRewarded) || 0) + 1 };
  delete nextData._id;
  delete nextData.createdAt;
  delete nextData.updatedAt;
  try {
    await updateDocByModel('EvilRootDaily', dailyId, nextData);
  } catch (_error) {
    // keep the old best-effort behavior
  }
  return nextData;
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  const id = toId(userId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(id);
  if (!row) return null;
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

exports.submitSession = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const { sessionId, symbols = 0, messages = 0 } = req.body || {};
    const safeSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!safeSessionId) {
      return res.status(400).json({ message: 'sessionId обязателен' });
    }

    const totalSymbols = toPositiveInt(symbols);
    const totalMessages = toPositiveInt(messages);
    const todayKey = dateKey();

    const existing = await findEvilRootSession(userId, safeSessionId);

    const daily = await upsertEvilRootDaily(userId, todayKey);

    const isNewSession = !existing;

    const prevSymbols = existing ? (Number(existing.data?.symbols) || 0) : 0;
    const prevMessages = existing ? (Number(existing.data?.messages) || 0) : 0;
    const nextSymbols = Math.max(prevSymbols, totalSymbols);
    const nextMessages = Math.max(prevMessages, totalMessages);

    let starsAwarded = existing ? (Number(existing.data?.starsAwarded) || 0) : 0;
    let radianceAwarded = existing ? (Number(existing.data?.radianceAwarded) || 0) : 0;

    const shouldHaveRadianceUnits = Math.floor(nextSymbols / 1000);
    const alreadyUnitsAwarded = existing ? Math.max(0, Number(existing.data?.radianceUnitsAwarded) || 0) : 0;
    const missingUnits = Math.max(0, shouldHaveRadianceUnits - alreadyUnitsAwarded);
    let nextRadianceUnitsAwarded = alreadyUnitsAwarded;

    if (missingUnits > 0) {
      let awardedAmountSum = 0;
      let awardedUnitsCount = 0;
      for (let i = 0; i < missingUnits; i += 1) {
        const unitIndex = alreadyUnitsAwarded + i;
        try {
          // eslint-disable-next-line no-await-in-loop
          const award = await awardRadianceForActivity({
            userId,
            activityType: 'evil_root_confession',
            units: 1,
            meta: { sessionId: safeSessionId, symbols: nextSymbols, unitIndex },
            dedupeKey: `evil_root_confession:${userId}:${safeSessionId}:${unitIndex}`,
          });
          if (award?.ok && !award?.skipped) {
            awardedAmountSum += Number(award.granted || award.amount || 0);
            awardedUnitsCount += 1;
          }
        } catch (e) {
          // ignore
        }
      }
      radianceAwarded = Math.max(0, radianceAwarded) + awardedAmountSum;
      nextRadianceUnitsAwarded = alreadyUnitsAwarded + awardedUnitsCount;
    }

    const shouldCountSession = isNewSession && ((daily.sessionsRewarded || 0) < EVIL_ROOT_DAILY_SESSIONS);
    if (shouldCountSession) {
      await incrementEvilRootDailySessionsRewarded(daily._id);
    }

    await upsertEvilRootSession(userId, safeSessionId, todayKey, {
      symbols: nextSymbols,
      messages: nextMessages,
      starsAwarded,
      radianceAwarded,
      radianceUnitsAwarded: nextRadianceUnitsAwarded,
    });

    if (nextSymbols > 0) {
      const { grantAchievement } = require('../services/achievementService');

      // 1. Ачивка #51: 10 000 символов суммарно
      const deltaSymbols = Math.max(0, nextSymbols - prevSymbols);
      const userRow = await getUserRowById(userId);
      const userData = getUserData(userRow);
      const stats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};
      const nextTotalSymbols = (Number(stats.totalSymbolsInEvilRoot) || 0) + deltaSymbols;
      await updateUserDataById(userId, {
        achievementStats: {
          ...stats,
          totalSymbolsInEvilRoot: nextTotalSymbols,
        }
      });
      if (nextTotalSymbols >= 10000) {
        await grantAchievement({ userId, achievementId: 51 });
      }

      // 2. Ачивка #65: Написать в Корень Зла сразу после поражения Древа
      try {
        const lastBattleAt = stats.lastBattleFinishedAt;
        const lastBattleWon = stats.lastBattleWon;
        if (lastBattleAt && lastBattleWon === false) {
          const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
          if (new Date(lastBattleAt) >= tenMinsAgo) {
            await grantAchievement({ userId, achievementId: 65 });
          }
        }
      } catch (e) {
        console.error('EvilRoot #65 check error:', e);
      }

      recordActivity({
        userId,
        type: 'evil_root_session',
        minutes: 1,
        meta: { sessionId: safeSessionId, symbols: nextSymbols, messages: nextMessages },
      }).catch(() => { });
    }

    return res.json({
      ok: true,
      starsAwarded,
      radianceAwarded,
      sessionCounted: shouldCountSession,
      daily: {
        sessionsRewarded: (daily.sessionsRewarded || 0) + (shouldCountSession ? 1 : 0),
        radianceRewardsCount: (daily.radianceRewardsCount || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
};
