const { awardFortuneK } = require('../kService');
const { recordActivity } = require('../activityService');
const { awardRadianceForActivity } = require('../activityRadianceService');
const { getFortuneConfig } = require('../fortuneConfigService');
const { recordFortuneWin } = require('../fortuneWinLogService');
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { listDocsByModel } = require('../documentStore');
const { getRequestLanguage } = require('../../utils/requestLanguage');
const {
  getDayKey,
  isSameLocalDay,
  nextMidnightLocal,
  startOfDayLocal,
} = require('./lotteryRules');
const {
  ensurePlannedRouletteSpins,
  normalizePlannedRouletteSpin,
} = require('./roulettePlanner');
const {
  findFortuneSpinByUser,
  upsertFortuneSpin,
} = require('./fortuneStore');
const {
  getUserData,
  getUserRowById,
  updateUserDataById,
} = require('./fortuneUsers');
const { getPersonalLuckAvailability } = require('./personalLuckDraw');

function normalizeLang(lang) {
  return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function getFortuneBoosts(userData) {
  return userData?.fortuneBoosts && typeof userData.fortuneBoosts === 'object'
    ? userData.fortuneBoosts
    : {};
}

const fortuneSpinCreateInflight = new Map();

async function findOrCreateFortuneSpin(userId) {
  let existing = await findFortuneSpinByUser(userId);
  if (existing) return { ...existing.data, _id: existing.id };

  const inflightKey = String(userId);
  const inflight = fortuneSpinCreateInflight.get(inflightKey);
  if (inflight) {
    await inflight;
    existing = await findFortuneSpinByUser(userId);
    return existing ? { ...existing.data, _id: existing.id } : null;
  }

  const createPromise = upsertFortuneSpin(null, {
    user: userId,
    spinsToday: 0,
    totalSpins: 0,
    adOfferSpinsToday: 0,
    spinsSinceLastStar: 0,
    pendingRouletteSpins: [],
  });
  fortuneSpinCreateInflight.set(inflightKey, createPromise);

  try {
    return await createPromise;
  } finally {
    if (fortuneSpinCreateInflight.get(inflightKey) === createPromise) {
      fortuneSpinCreateInflight.delete(inflightKey);
    }
  }
}

function normalizeRouletteSpinState(spinData) {
  spinData.spinsToday = Math.max(0, Math.floor(Number(spinData.spinsToday) || 0));
  spinData.totalSpins = Math.max(0, Math.floor(Number(spinData.totalSpins) || 0));
  spinData.adOfferSpinsToday = Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0));
  spinData.spinsSinceLastStar = Math.max(0, Math.floor(Number(spinData.spinsSinceLastStar) || 0));
  if (!Array.isArray(spinData.pendingRouletteSpins)) {
    spinData.pendingRouletteSpins = [];
  }
  return spinData;
}

async function ensureFortuneSpinStateForToday(userId, now = new Date(), { persistReset = false } = {}) {
  const spinData = await findOrCreateFortuneSpin(userId);
  normalizeRouletteSpinState(spinData);
  const lastSpin = spinData.lastSpinAt ? new Date(spinData.lastSpinAt) : null;

  if (!lastSpin || isSameLocalDay(now, lastSpin)) {
    return spinData;
  }

  const shouldPersistReset = (Number(spinData.spinsToday) > 0 || Number(spinData.adOfferSpinsToday) > 0) && persistReset;
  spinData.spinsToday = 0;
  spinData.adOfferSpinsToday = 0;
  spinData.pendingRouletteSpins = [];

  if (shouldPersistReset) {
    await upsertFortuneSpin(spinData._id, spinData);
  }

  return spinData;
}

function calculateRouletteSpinCounts({ spinData, dailyFreeSpins, availableAdExtraSpins }) {
  const countedSpinsToday = Math.max(
    Math.max(0, Math.floor(Number(spinData.spinsToday) || 0)),
    Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0))
  );
  const freeSpinsLeft = Math.max(0, dailyFreeSpins - countedSpinsToday);
  const spinsLeft = freeSpinsLeft + availableAdExtraSpins;

  return {
    countedSpinsToday,
    freeSpinsLeft,
    spinsLeft,
  };
}

function sumRouletteRewardsTodayRows(rows) {
  if (!Array.isArray(rows)) return { k: 0, stars: 0 };

  return rows.reduce((acc, row) => {
    const type = String(row?.type || '');
    const currency = String(row?.currency || 'K').toUpperCase();
    const description = String(row?.description || '').trim().toLowerCase();
    const amount = Number(row?.amount) || 0;
    if (!(amount > 0)) return acc;
    if (type === 'fortune' && currency === 'K') {
      const isRouletteWin = description.includes('выигрыш в колесе фортуны')
        || description.includes('fortune wheel winnings');
      if (isRouletteWin) acc.k += amount;
    }
    if (type === 'fortune_roulette' && currency === 'STAR') {
      acc.stars += amount;
    }
    return acc;
  }, { k: 0, stars: 0 });
}

async function getRouletteRewardsToday(userId, now = new Date()) {
  const from = startOfDayLocal(now).toISOString();
  const to = nextMidnightLocal(now).toISOString();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id,type,direction,amount,currency,description,occurred_at')
    .eq('user_id', String(userId))
    .eq('direction', 'credit')
    .gte('occurred_at', from)
    .lt('occurred_at', to)
    .limit(5000);
  if (error || !Array.isArray(data)) return { k: 0, stars: 0 };

  return sumRouletteRewardsTodayRows(data);
}

function buildRouletteStatusPayload({
  spinData,
  now,
  dailyFreeSpins,
  availableAdExtraSpins,
  plannedSpins,
  luckyDayAvailable,
}) {
  const { freeSpinsLeft, spinsLeft } = calculateRouletteSpinCounts({
    spinData,
    dailyFreeSpins,
    availableAdExtraSpins,
  });

  return {
    spinsLeft,
    freeSpinsLeft,
    adExtraSpins: availableAdExtraSpins,
    totalSpins: spinData.totalSpins,
    lastSpinAt: spinData.lastSpinAt,
    nextResetAt: nextMidnightLocal(now),
    plannedSpins,
    luckyDayAvailable,
  };
}

function buildRouletteSpinResponse({
  originalIndex,
  result,
  spinData,
  dailyFreeSpins,
  usingAdExtraSpin,
  availableAdExtraSpins,
  now,
  boostOffer,
}) {
  const { freeSpinsLeft } = calculateRouletteSpinCounts({
    spinData,
    dailyFreeSpins,
    availableAdExtraSpins,
  });
  const remainingAdExtraSpins = usingAdExtraSpin ? Math.max(0, availableAdExtraSpins - 1) : availableAdExtraSpins;

  return {
    sectorIndex: originalIndex < 0 ? 0 : originalIndex,
    result,
    spinsLeft: freeSpinsLeft + remainingAdExtraSpins,
    freeSpinsLeft,
    adExtraSpins: remainingAdExtraSpins,
    nextResetAt: nextMidnightLocal(now),
    boostOffer,
  };
}

function buildRouletteSpinRadiancePayload({ userId, spinData, result }) {
  return {
    userId,
    amount: 2,
    activityType: 'fortune_spin',
    meta: { spinNumber: spinData.totalSpins, resultType: result.type, resultLabel: result.label },
    dedupeKey: `fortune_spin:${userId}:${spinData.totalSpins}`,
  };
}

function buildRouletteActivityPayload({ userId, result }) {
  return {
    userId,
    type: 'fortune_spin',
    minutes: 1,
    meta: {
      resultType: result.type,
      resultLabel: result.label,
      resultValue: Number(result.value) || 0,
    },
  };
}

function buildRouletteWinLogPayload({
  userId,
  result,
  spinData,
  now,
  originalIndex,
  usingAdExtraSpin,
  dailyFreeSpins,
}) {
  return {
    userId,
    gameType: 'roulette',
    rewardType: result.type === 'k' || result.type === 'star' || result.type === 'spin' ? result.type : 'other',
    amount: Number(result.value) || 0,
    label: String(result.label || ''),
    occurredAt: now,
    meta: {
      spinNumber: spinData.totalSpins,
      sectorIndex: originalIndex < 0 ? 0 : originalIndex,
      adOfferSpinNumber: Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)),
      usingAdExtraSpin,
      eligibleForRouletteDouble: !usingAdExtraSpin && Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)) <= dailyFreeSpins,
    },
  };
}

async function createRouletteAdBoostOffer(payload) {
  const { createAdBoostOffer } = require('../adBoostService');
  return createAdBoostOffer(payload);
}

async function applyRouletteStarReward(payload) {
  const { applyStarsDelta } = require('../../utils/stars');
  return applyStarsDelta(payload);
}

async function grantRouletteAchievements({
  result,
  lastSpinWasBonus,
  req,
  spinData,
  dailyFreeSpins,
  now,
}) {
  try {
    const { grantAchievement } = require('../achievementService');

    if (result.type === 'spin') {
      const recentBattleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const battleRows = await listDocsByModel('Battle', {
        dataEq: { status: 'finished', winner: 'light' },
        columnGte: { updated_at: recentBattleCutoff },
        orderBy: 'updated_at',
        ascending: false,
        limit: 100,
      });

      if (Array.isArray(battleRows)) {
        const userBattles = battleRows
          .filter((row) => {
            const participants = row?.participants || [];
            return participants.some((p) => String(p.user) === String(req.user._id));
          })
          .map((row) => ({ ...row, _id: row._id, updatedAt: row.updatedAt }))
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        const lastBattle = userBattles[0];
        if (lastBattle && lastBattle.status === 'finished' && lastBattle.winner === 'light') {
          if (Date.now() - new Date(lastBattle.updatedAt).getTime() < 15 * 60 * 1000) {
            await grantAchievement({ userId: req.user._id, achievementId: 63 });
          }
        }
      }
    }

    if (result.type === 'k' && result.value === 100) {
      const userRow = await getUserRowById(req.user._id);
      const data = getUserData(userRow);
      const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};
      const nextCount = (Number(stats.totalRoulette100KWins) || 0) + 1;
      await updateUserDataById(req.user._id, { achievementStats: { ...stats, totalRoulette100KWins: nextCount } });
      if (nextCount >= 3) {
        await grantAchievement({ userId: req.user._id, achievementId: 79 });
      }
    }

    if (lastSpinWasBonus && result.type === 'k' && result.value >= 50) {
      await grantAchievement({ userId: req.user._id, achievementId: 80 });
    }

    if (spinData.spinsToday === dailyFreeSpins) {
      const userRow = await getUserRowById(req.user._id);
      const data = getUserData(userRow);
      const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};
      let row = (stats?.rouletteSpinsRow30 || 0);
      const lastRowDate = stats?.lastRouletteSpinAt;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastRowDate && isSameLocalDay(lastRowDate, yesterday)) {
        row += 1;
      } else if (!lastRowDate || !isSameLocalDay(lastRowDate, now)) {
        row = 1;
      }

      await updateUserDataById(req.user._id, {
        achievementStats: {
          ...stats,
          rouletteSpinsRow30: row,
          lastRouletteSpinAt: now,
        }
      });
      if (row >= 30) await grantAchievement({ userId: req.user._id, achievementId: 81 });
    }

    if (result.type === 'star') {
      await grantAchievement({ userId: req.user._id, achievementId: 82 });
    }
  } catch (error) {
    console.error('Roulette achievement error:', error);
  }
}

async function getSpinStatus(req, res) {
  try {
    const now = new Date();
    const [fortuneConfig, spinData, userRowForBoost] = await Promise.all([
      getFortuneConfig(),
      ensureFortuneSpinStateForToday(req.user._id, now, { persistReset: true }),
      getUserRowById(req.user._id),
    ]);

    const dailyFreeSpins = Math.max(1, Number(fortuneConfig?.roulette?.dailyFreeSpins) || 3);
    const userBoostData = getUserData(userRowForBoost);
    const fortuneBoosts = getFortuneBoosts(userBoostData);
    const availableAdExtraSpins = Math.max(0, Math.floor(Number(fortuneBoosts.rouletteExtraSpins) || 0));
    const { spinsLeft } = calculateRouletteSpinCounts({
      spinData,
      dailyFreeSpins,
      availableAdExtraSpins,
    });
    const plannedSpins = ensurePlannedRouletteSpins({
      spinData,
      rouletteConfig: fortuneConfig?.roulette || {},
      count: spinsLeft,
      now,
    });

    await upsertFortuneSpin(spinData._id, spinData);

    const alreadyToday = await getPersonalLuckAvailability({
      userId: req.user._id,
      now,
      fallbackLastLuckyDrawAt: userBoostData?.achievementStats?.lastLuckyDrawAt || null,
    });

    res.json(buildRouletteStatusPayload({
      spinData,
      now,
      dailyFreeSpins,
      availableAdExtraSpins,
      plannedSpins,
      luckyDayAvailable: !alreadyToday,
    }));
  } catch (error) {
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
}

async function spin(req, res) {
  try {
    const userLang = normalizeLang(getRequestLanguage(req));
    const now = new Date();
    const [fortuneConfig, spinData] = await Promise.all([
      getFortuneConfig(),
      ensureFortuneSpinStateForToday(req.user._id, now),
    ]);

    const rouletteConfig = fortuneConfig?.roulette || {};
    const dailyFreeSpins = Math.max(1, Number(rouletteConfig.dailyFreeSpins) || 3);
    const userRowForBoost = await getUserRowById(req.user._id);
    const userBoostData = getUserData(userRowForBoost);
    const fortuneBoosts = getFortuneBoosts(userBoostData);
    const availableAdExtraSpins = Math.max(0, Math.floor(Number(fortuneBoosts.rouletteExtraSpins) || 0));
    const adOfferSpinsToday = Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0));
    const freeAttemptLimitReached = adOfferSpinsToday >= dailyFreeSpins;
    const usingAdExtraSpin = freeAttemptLimitReached && availableAdExtraSpins > 0;

    if (freeAttemptLimitReached && !usingAdExtraSpin) {
      return res.status(400).json({
        message: pickLang(userLang, 'Бесплатные вращения на сегодня закончились', 'Free spins for today are over'),
      });
    }

    let plannedQueue = Array.isArray(spinData.pendingRouletteSpins)
      ? spinData.pendingRouletteSpins.map(normalizePlannedRouletteSpin).filter(Boolean)
      : [];
    let plannedSpin = plannedQueue.shift();

    if (!plannedSpin) {
      const planned = ensurePlannedRouletteSpins({
        spinData,
        rouletteConfig,
        count: 1,
        now,
      });
      plannedQueue = Array.isArray(spinData.pendingRouletteSpins)
        ? spinData.pendingRouletteSpins.map(normalizePlannedRouletteSpin).filter(Boolean)
        : [];
      plannedSpin = Array.isArray(planned) && planned.length ? plannedQueue.shift() : null;
    }

    if (!plannedSpin) {
      return res.status(400).json({
        message: pickLang(userLang, 'В конфигурации рулетки нет активных секторов', 'No active roulette sectors in configuration'),
      });
    }

    spinData.pendingRouletteSpins = plannedQueue;
    const result = plannedSpin.result;
    const originalIndex = Math.max(0, Math.floor(Number(plannedSpin.sectorIndex) || 0));
    const lastSpinWasBonus = spinData.lastSpinWasBonus;

    spinData.spinsToday += usingAdExtraSpin ? 0 : 1;
    if (!usingAdExtraSpin) {
      spinData.adOfferSpinsToday = Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)) + 1;
    }
    spinData.totalSpins += 1;
    spinData.lastSpinAt = now;
    spinData.spinsSinceLastStar = Math.max(0, Math.floor(Number(spinData.spinsSinceLastStar) || 0)) + 1;
    spinData.lastPrize = result.label;
    spinData.lastPrizeType = result.type;

    await grantRouletteAchievements({
      result,
      lastSpinWasBonus,
      req,
      spinData,
      dailyFreeSpins,
      now,
    });

    spinData.lastSpinWasBonus = (result.type === 'spin');

    if (result.type === 'star') {
      spinData.lastStarWinAt = now;
      spinData.spinsSinceLastStar = 0;
    }

    if (result.type === 'spin' && !usingAdExtraSpin) {
      spinData.spinsToday = Math.max(0, spinData.spinsToday - 1);
    }

    if (usingAdExtraSpin) {
      await updateUserDataById(req.user._id, {
        fortuneBoosts: {
          ...fortuneBoosts,
          rouletteExtraSpins: Math.max(0, availableAdExtraSpins - 1),
        },
      });
    }

    await upsertFortuneSpin(spinData._id, spinData);

    recordFortuneWin(buildRouletteWinLogPayload({
      userId: req.user._id,
      result,
      spinData,
      now,
      originalIndex,
      usingAdExtraSpin,
      dailyFreeSpins,
    })).catch(() => null);

    awardRadianceForActivity(buildRouletteSpinRadiancePayload({
      userId: req.user._id,
      spinData,
      result,
    })).catch(() => { });

    recordActivity(buildRouletteActivityPayload({
      userId: req.user._id,
      result,
    })).catch(() => { });

    if (result.type === 'k' && result.value > 0) {
      await awardFortuneK({
        userId: req.user._id,
        amount: result.value,
        description: pickLang(userLang, 'Выигрыш в Колесе Фортуны', 'Fortune Wheel winnings'),
      });
    } else if (result.type === 'star' && result.value > 0) {
      await applyRouletteStarReward({
        userId: req.user._id,
        delta: result.value,
        type: 'fortune_roulette',
        description: pickLang(userLang, 'Колесо Фортуны', 'Fortune Wheel'),
        relatedEntity: spinData._id,
        occurredAt: now,
      });
    }

    let boostOffer = null;
    if (!usingAdExtraSpin && Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)) >= dailyFreeSpins) {
      boostOffer = await createRouletteAdBoostOffer({
        userId: req.user._id,
        type: 'roulette_extra_spin',
        contextKey: `roulette_extra:${req.user._id}:${getDayKey(now)}`,
        page: 'fortune/roulette',
        title: pickLang(userLang, 'Дополнительное вращение', 'Extra spin'),
        description: pickLang(userLang, 'Досмотрите видео, чтобы получить ещё одно вращение рулетки.', 'Watch the video to receive one extra roulette spin.'),
        reward: { kind: 'roulette_extra_spin' },
      }).catch(() => null);
    } else if (usingAdExtraSpin) {
      const todayRewards = await getRouletteRewardsToday(req.user._id, now);

      if (todayRewards.k > 0 || todayRewards.stars > 0) {
        boostOffer = await createRouletteAdBoostOffer({
          userId: req.user._id,
          type: 'roulette_double_today',
          contextKey: `roulette_double:${req.user._id}:${getDayKey(now)}`,
          page: 'fortune/roulette',
          title: pickLang(userLang, 'Удвоить выигрыш рулетки', 'Double roulette winnings'),
          description: pickLang(userLang, 'Досмотрите видео, чтобы повторить сегодняшние выигрыши рулетки.', 'Watch the video to repeat today’s roulette winnings.'),
          reward: {
            kind: 'currency',
            k: todayRewards.k,
            stars: todayRewards.stars,
            transactionType: 'roulette_ad_boost',
            description: pickLang(userLang, 'Дополнительная награда: Фортуна (Рулетка)', 'Extra reward: Fortune (Roulette)'),
          },
        }).catch(() => null);
      }
    }

    res.json(buildRouletteSpinResponse({
      originalIndex,
      result,
      spinData,
      dailyFreeSpins,
      usingAdExtraSpin,
      availableAdExtraSpins,
      now,
      boostOffer,
    }));
  } catch (error) {
    console.error('Roulette spin error:', error);
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
}

function resetRouletteRuntimeState() {
  fortuneSpinCreateInflight.clear();
}

module.exports = {
  buildRouletteActivityPayload,
  buildRouletteSpinRadiancePayload,
  buildRouletteSpinResponse,
  buildRouletteStatusPayload,
  buildRouletteWinLogPayload,
  calculateRouletteSpinCounts,
  getSpinStatus,
  normalizeRouletteSpinState,
  resetRouletteRuntimeState,
  spin,
  sumRouletteRewardsTodayRows,
};
