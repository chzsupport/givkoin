const { countActivities, listActivities, recordActivity } = require('../services/activityService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { getDocById, upsertDoc } = require('../services/documentStore');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { recordTransaction } = require('../services/scService');
const { applyTreeBlessingToReward } = require('../services/treeBlessingService');
const { getRequestLanguage } = require('../utils/requestLanguage');

const DAILY_STREAK_STATUS_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.DAILY_STREAK_STATUS_CACHE_TTL_MS) || 10 * 1000
);

const STATE_MODEL = 'DailyStreakState';
const dailyStreakStatusCache = new Map();
const dailyStreakStatusInflight = new Map();
const dailyStreakActionInflight = new Map();
const THIRD_DAY_SC_REWARDS = Object.freeze({
  3: 10,
  6: 20,
  9: 30,
  12: 40,
  15: 50,
  18: 60,
  21: 70,
  24: 80,
  27: 90,
  30: 100,
});

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
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
  const next = { ...getUserData(row), ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getThirdDayPrizeSc(day) {
  return Math.max(0, Number(THIRD_DAY_SC_REWARDS[Number(day)] || 0));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dayKeyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDayLocal(date) {
  const d = startOfDayLocal(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function dayDiff(fromDay, toDay) {
  const a = new Date(`${String(fromDay)}T00:00:00.000Z`).getTime();
  const b = new Date(`${String(toDay)}T00:00:00.000Z`).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function clampDay(day) {
  return Math.max(1, Math.min(30, Number(day) || 1));
}

function uniqDays(items) {
  return Array.from(new Set(
    (Array.isArray(items) ? items : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 30)
  )).sort((a, b) => a - b);
}

function buildStateDocId(userId) {
  return `daily_streak_state:${String(userId)}`;
}

function createEmptyState(userId) {
  return {
    _id: buildStateDocId(userId),
    user: String(userId),
    cycleStartDay: null,
    claimedDays: [],
    missedDays: [],
    questDoneDays: [],
    lastSeenServerDay: null,
    lastWelcomeShownServerDay: null,
  };
}

function normalizeState(raw, userId) {
  const base = createEmptyState(userId);
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    ...base,
    ...row,
    user: String(userId),
    cycleStartDay: typeof row.cycleStartDay === 'string' ? row.cycleStartDay : null,
    claimedDays: uniqDays(row.claimedDays),
    missedDays: uniqDays(row.missedDays),
    questDoneDays: uniqDays(row.questDoneDays),
    lastSeenServerDay: typeof row.lastSeenServerDay === 'string' ? row.lastSeenServerDay : null,
    lastWelcomeShownServerDay: typeof row.lastWelcomeShownServerDay === 'string' ? row.lastWelcomeShownServerDay : null,
  };
}

async function getDailyStreakState(userId) {
  const row = await getDocById(buildStateDocId(userId));
  return normalizeState(row, userId);
}

async function saveDailyStreakState(userId, state, now = new Date()) {
  const normalized = normalizeState(state, userId);
  await upsertDoc({
    id: buildStateDocId(userId),
    model: STATE_MODEL,
    data: {
      user: normalized.user,
      cycleStartDay: normalized.cycleStartDay,
      claimedDays: normalized.claimedDays,
      missedDays: normalized.missedDays,
      questDoneDays: normalized.questDoneDays,
      lastSeenServerDay: normalized.lastSeenServerDay,
      lastWelcomeShownServerDay: normalized.lastWelcomeShownServerDay,
    },
    createdAt: now,
    updatedAt: now,
  });
  return normalized;
}

function getCurrentDayIndex(state, serverDay) {
  if (!state?.cycleStartDay || !serverDay) return 1;
  return clampDay(dayDiff(state.cycleStartDay, serverDay) + 1);
}

function syncStateForDay(state, serverDay, { markSeen = true } = {}) {
  const next = normalizeState(state, state?.user || '');
  if (!next.cycleStartDay) {
    next.cycleStartDay = serverDay;
  }

  if (next.lastSeenServerDay) {
    const diff = dayDiff(next.lastSeenServerDay, serverDay);
    if (diff > 0 && next.cycleStartDay) {
      const currentIndex = getCurrentDayIndex(next, serverDay);
      for (let day = 1; day < currentIndex; day += 1) {
        if (!next.claimedDays.includes(day) && !next.missedDays.includes(day)) {
          next.missedDays = uniqDays([...next.missedDays, day]);
        }
      }
    }
  }

  if (markSeen) {
    next.lastSeenServerDay = serverDay;
  }

  return next;
}

async function getSyncedState(userId, now = new Date(), { markSeen = true } = {}) {
  const serverDay = dayKeyLocal(now);
  const existing = await getDailyStreakState(userId);
  const next = syncStateForDay(existing, serverDay, { markSeen });
  const persisted = await saveDailyStreakState(userId, next, now);
  return {
    state: persisted,
    serverDay,
    currentDayIndex: getCurrentDayIndex(persisted, serverDay),
  };
}

function getDailyStreakStatusCacheKey(userId, now = new Date()) {
  return `${String(userId)}:${dayKeyLocal(now)}`;
}

function getDailyStreakStatusCacheExpiry(now, nowMs = Date.now()) {
  return Math.min(endOfDayLocal(now).getTime(), nowMs + DAILY_STREAK_STATUS_CACHE_TTL_MS);
}

function getCachedDailyStreakStatus(cacheKey, nowMs = Date.now()) {
  const cached = dailyStreakStatusCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= nowMs) {
    dailyStreakStatusCache.delete(cacheKey);
    return null;
  }
  return cached.status;
}

function setCachedDailyStreakStatus(cacheKey, status, now, nowMs = Date.now()) {
  dailyStreakStatusCache.set(cacheKey, {
    status,
    expiresAt: getDailyStreakStatusCacheExpiry(now, nowMs),
  });
  return status;
}

function buildTodayQuestStatusPayload({ now, solarCount, stones, fortuneSpinCount }) {
  return {
    serverDay: dayKeyLocal(now),
    tasks: {
      energyCollected: solarCount >= 1,
      bridgeStoneLaid: stones >= 1,
      rouletteSpins3: fortuneSpinCount >= 3,
    },
  };
}

async function loadTodayQuestStatusForUser(userId, now = new Date(), { useCache = true } = {}) {
  const cacheKey = getDailyStreakStatusCacheKey(userId, now);
  const nowMs = now.getTime();

  if (useCache) {
    const cached = getCachedDailyStreakStatus(cacheKey, nowMs);
    if (cached) return cached;

    const inflight = dailyStreakStatusInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const from = startOfDayLocal(now);
  const to = endOfDayLocal(now);

  const promise = Promise.all([
    countActivities({ userId, type: 'solar_collect', from, to }),
    listActivities({ userIds: [userId], types: ['bridge_contribute'], since: from, until: to, limit: 2000 }),
    countActivities({ userId, type: 'fortune_spin', from, to }),
  ]).then(([solarCount, bridgeRows, fortuneSpinCount]) => {
    const stones = (Array.isArray(bridgeRows) ? bridgeRows : []).reduce((sum, row) => {
      const v = Number(row?.meta?.stones);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
    const status = buildTodayQuestStatusPayload({ now, solarCount, stones, fortuneSpinCount });
    if (!useCache) return status;
    return setCachedDailyStreakStatus(cacheKey, status, now, nowMs);
  }).finally(() => {
    if (useCache && dailyStreakStatusInflight.get(cacheKey) === promise) {
      dailyStreakStatusInflight.delete(cacheKey);
    }
  });

  if (useCache) {
    dailyStreakStatusInflight.set(cacheKey, promise);
  }

  return promise;
}

function buildStateResponse({ state, serverDay, currentDayIndex, todayStatus, radianceAward = null }) {
  const claimedToday = state.claimedDays.includes(currentDayIndex);
  const questDoneToday = state.questDoneDays.includes(currentDayIndex);
  return {
    serverDay,
    cycleStartDay: state.cycleStartDay,
    claimedDays: state.claimedDays,
    missedDays: state.missedDays,
    questDoneDays: state.questDoneDays,
    lastSeenServerDay: state.lastSeenServerDay,
    lastWelcomeShownServerDay: state.lastWelcomeShownServerDay,
    currentDayIndex,
    today: {
      day: currentDayIndex,
      tasks: todayStatus.tasks,
      claim: { clickedToday: claimedToday },
      quest: { completedToday: questDoneToday },
    },
    radianceAward,
  };
}

async function ensureDailyActionLog({ userId, type, now = new Date() }) {
  const inflightKey = `${type}:${String(userId)}:${dayKeyLocal(now)}`;
  const inflight = dailyStreakActionInflight.get(inflightKey);
  if (inflight) return inflight;

  const from = startOfDayLocal(now);
  const to = endOfDayLocal(now);

  const promise = (async () => {
    const rows = await listActivities({
      userIds: [userId],
      types: [type],
      since: from,
      until: to,
      limit: 1,
    });

    if (Array.isArray(rows) && rows.length > 0) {
      return { ok: true, already: true, serverDay: dayKeyLocal(now) };
    }

    await recordActivity({ userId, type, minutes: 0, meta: {}, createdAt: now });
    return { ok: true, already: false, serverDay: dayKeyLocal(now) };
  })().finally(() => {
    if (dailyStreakActionInflight.get(inflightKey) === promise) {
      dailyStreakActionInflight.delete(inflightKey);
    }
  });

  dailyStreakActionInflight.set(inflightKey, promise);
  return promise;
}

async function maybeAwardAttendanceForDay({ userId, state, serverDay, currentDayIndex, now = new Date(), language = 'ru' }) {
  const ready = state.claimedDays.includes(currentDayIndex) && state.questDoneDays.includes(currentDayIndex);
  if (!ready) {
    return {
      radianceAward: null,
      scReward: 0,
      userSc: null,
    };
  }

  const result = await awardRadianceForActivity({
    userId,
    activityType: 'attendance_day',
    meta: { serverDay, dayIndex: currentDayIndex },
    dedupeKey: `attendance_day:${String(userId)}:${serverDay}`,
  }).catch(() => null);

  let scReward = 0;
  let userSc = null;
  const prizeAmount = getThirdDayPrizeSc(currentDayIndex);
  if (prizeAmount > 0) {
    const prizeLog = await ensureDailyActionLog({
      userId,
      type: 'daily_streak_bonus_sc',
      now,
    });

    if (!prizeLog.already) {
      const userRow = await getUserRowById(userId);
      if (userRow) {
        const userData = getUserData(userRow);
        const blessingReward = await applyTreeBlessingToReward({
          userId,
          sc: prizeAmount,
          now,
        });
        const awardedSc = blessingReward.sc;
        userSc = (Number(userData.sc) || 0) + awardedSc;
        await updateUserDataById(userId, { sc: userSc });
        await recordTransaction({
          userId,
          type: 'attendance_bonus',
          direction: 'credit',
          amount: awardedSc,
          currency: 'K',
          description: language === 'en'
            ? `Attendance: day ${currentDayIndex}`
            : `Посещаемость: день ${currentDayIndex}`,
          relatedEntity: `attendance_day:${serverDay}`,
          occurredAt: now,
        }).catch(() => null);
        scReward = awardedSc;
      }
    }
  }

  return {
    radianceAward: result?.ok && !result?.skipped
      ? {
        activityType: 'attendance_day',
        amount: result.granted || result.amount || 0,
        occurredAt: now.toISOString(),
      }
      : null,
    scReward,
    userSc,
  };
}

async function getState(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const [{ state, serverDay, currentDayIndex }, todayStatus] = await Promise.all([
      getSyncedState(userId, now, { markSeen: true }),
      loadTodayQuestStatusForUser(userId, now),
    ]);
    return res.json(buildStateResponse({ state, serverDay, currentDayIndex, todayStatus }));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Ошибка сервера' });
  }
}

async function getTodayQuestStatus(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const [{ state, currentDayIndex }, todayStatus] = await Promise.all([
      getSyncedState(userId, now, { markSeen: true }),
      loadTodayQuestStatusForUser(userId, now),
    ]);
    return res.json({
      serverDay: todayStatus.serverDay,
      tasks: todayStatus.tasks,
      claim: {
        clickedToday: state.claimedDays.includes(currentDayIndex),
      },
      quest: {
        completedToday: state.questDoneDays.includes(currentDayIndex),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Ошибка сервера' });
  }
}

async function claimToday(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const claimLog = await ensureDailyActionLog({ userId, type: 'daily_streak_claim', now });
    const synced = await getSyncedState(userId, now, { markSeen: true });
    const { state, serverDay, currentDayIndex } = synced;

    let nextState = state;
    if (!state.claimedDays.includes(currentDayIndex)) {
      nextState = await saveDailyStreakState(userId, {
        ...state,
        claimedDays: uniqDays([...state.claimedDays, currentDayIndex]),
        missedDays: state.missedDays.filter((day) => day !== currentDayIndex),
      }, now);
    }

    const todayStatus = await loadTodayQuestStatusForUser(userId, now, { useCache: false });
    const reward = await maybeAwardAttendanceForDay({
      userId,
      state: nextState,
      serverDay,
      currentDayIndex,
      now,
      language: getRequestLanguage(req),
    });

    return res.json({
      ok: true,
      already: claimLog.already || state.claimedDays.includes(currentDayIndex),
      scReward: reward.scReward || 0,
      user: reward.userSc != null ? { sc: reward.userSc } : undefined,
      state: buildStateResponse({
        state: nextState,
        serverDay,
        currentDayIndex,
        todayStatus,
        radianceAward: reward.radianceAward,
      }),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Ошибка сервера' });
  }
}

async function completeQuestToday(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const todayStatus = await loadTodayQuestStatusForUser(userId, now, { useCache: false });

    if (!todayStatus.tasks.energyCollected || !todayStatus.tasks.bridgeStoneLaid || !todayStatus.tasks.rouletteSpins3) {
      return res.status(400).json({
        message: 'Мини-квест ещё не выполнен полностью',
        tasks: todayStatus.tasks,
      });
    }

    const questLog = await ensureDailyActionLog({ userId, type: 'daily_streak_quest', now });
    const { state, serverDay, currentDayIndex } = await getSyncedState(userId, now, { markSeen: true });

    let nextState = state;
    if (!state.questDoneDays.includes(currentDayIndex)) {
      nextState = await saveDailyStreakState(userId, {
        ...state,
        questDoneDays: uniqDays([...state.questDoneDays, currentDayIndex]),
      }, now);
    }

    const reward = await maybeAwardAttendanceForDay({
      userId,
      state: nextState,
      serverDay,
      currentDayIndex,
      now,
      language: getRequestLanguage(req),
    });

    return res.json({
      ok: true,
      already: questLog.already || state.questDoneDays.includes(currentDayIndex),
      scReward: reward.scReward || 0,
      user: reward.userSc != null ? { sc: reward.userSc } : undefined,
      state: buildStateResponse({
        state: nextState,
        serverDay,
        currentDayIndex,
        todayStatus,
        radianceAward: reward.radianceAward,
      }),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Ошибка сервера' });
  }
}

async function markWelcomeSeen(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const { state, serverDay, currentDayIndex } = await getSyncedState(userId, now, { markSeen: true });
    const nextState = await saveDailyStreakState(userId, {
      ...state,
      lastWelcomeShownServerDay: serverDay,
    }, now);
    const todayStatus = await loadTodayQuestStatusForUser(userId, now);
    return res.json({
      ok: true,
      state: buildStateResponse({ state: nextState, serverDay, currentDayIndex, todayStatus }),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Ошибка сервера' });
  }
}

module.exports = {
  getState,
  getTodayQuestStatus,
  claimToday,
  completeQuestToday,
  markWelcomeSeen,
  __resetDailyStreakControllerRuntimeState: () => {
    dailyStreakStatusCache.clear();
    dailyStreakStatusInflight.clear();
    dailyStreakActionInflight.clear();
  },
};

