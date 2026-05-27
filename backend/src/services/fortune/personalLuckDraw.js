const crypto = require('crypto');

const { awardFortuneK } = require('../kService');
const { awardRadianceForActivity } = require('../activityRadianceService');
const {
  reservePersonalLuckClaim,
  finalizePersonalLuckClaim,
  rollbackPersonalLuckClaim,
  hasClaimedPersonalLuckToday,
} = require('../personalLuckService');
const { getRequestLanguage } = require('../../utils/requestLanguage');
const {
  getUserData,
  getUserRowById,
  updateUserDataById,
} = require('./fortuneUsers');
const {
  getDayKey,
  startOfDayLocal,
} = require('./lotteryRules');

const personalLuckInFlight = new Set();

function normalizeLang(lang) {
  return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function normalizePersonalLuckCreditedAmount(awardResult, fallbackAmount) {
  if (!awardResult) return 0;
  if (Number.isFinite(Number(awardResult?.creditedAmount))) {
    return Math.max(0, Number(awardResult.creditedAmount) || 0);
  }
  return Math.max(0, Number(fallbackAmount) || 0);
}

function buildPersonalLuckRadiancePayload({ userId, dayStart }) {
  const day = dayStart.toISOString().slice(0, 10);
  return {
    userId,
    amount: 5,
    activityType: 'personal_luck',
    meta: { day },
    dedupeKey: `personal_luck:${userId}:${day}`,
  };
}

function buildPersonalLuckBoostOfferPayload({ userId, now, creditedAmount, userLang }) {
  return {
    userId,
    type: 'personal_luck_double',
    contextKey: `personal_luck_double:${userId}:${getDayKey(now)}`,
    page: 'fortune',
    title: pickLang(userLang, 'Удвоить личную удачу', 'Double personal luck'),
    description: pickLang(userLang, 'Досмотрите видео, чтобы получить ещё столько же K.', 'Watch the video to receive the same K reward again.'),
    reward: {
      kind: 'currency',
      k: creditedAmount,
      transactionType: 'personal_luck_ad_reward',
      description: pickLang(userLang, 'Дополнительная награда: Личная удача', 'Extra reward: Personal luck'),
    },
  };
}

async function getPersonalLuckAvailability({ userId, now = new Date(), fallbackLastLuckyDrawAt = null }) {
  return hasClaimedPersonalLuckToday({
    userId,
    now,
    fallbackLastLuckyDrawAt,
  });
}

async function drawPersonalLuck(req, res) {
  const userId = req.user?._id?.toString?.() || '';
  const userLang = normalizeLang(getRequestLanguage(req));

  if (!userId) {
    return res.status(401).json({ message: pickLang(userLang, 'Требуется авторизация', 'Authorization required') });
  }
  if (personalLuckInFlight.has(userId)) {
    return res.status(429).json({
      message: pickLang(userLang, 'Подождите, обрабатываем предыдущий запрос', 'Please wait, your previous request is still being processed'),
    });
  }

  personalLuckInFlight.add(userId);

  try {
    const now = new Date();
    const dayStart = startOfDayLocal(now);
    const userRow = await getUserRowById(req.user._id);
    const userData = getUserData(userRow);
    const stats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};
    const reserve = await reservePersonalLuckClaim({
      userId: req.user._id,
      now,
      fallbackLastLuckyDrawAt: stats?.lastLuckyDrawAt || null,
    });

    if (!reserve.ok) {
      return res.status(400).json({
        message: pickLang(userLang, 'Вы уже получили свою удачу сегодня', 'You have already claimed your luck today'),
      });
    }

    const amount = crypto.randomInt(1, 51);
    let creditedAmount = amount;

    try {
      const awardResult = await awardFortuneK({
        userId: req.user._id,
        amount,
        description: pickLang(userLang, 'Личная удача', 'Personal luck'),
      });
      creditedAmount = normalizePersonalLuckCreditedAmount(awardResult, amount);
    } catch (error) {
      await rollbackPersonalLuckClaim({ claimId: reserve.claimId });
      throw error;
    }

    await Promise.all([
      finalizePersonalLuckClaim({
        claimId: reserve.claimId,
        amount: creditedAmount,
        rewardLabel: `${creditedAmount} K`,
        finalizedAt: now,
      }),
      updateUserDataById(req.user._id, { achievementStats: { ...stats, lastLuckyDrawAt: now } }),
    ]);

    awardRadianceForActivity(buildPersonalLuckRadiancePayload({
      userId: req.user._id,
      dayStart,
    })).catch(() => { });

    const boostOffer = creditedAmount > 0
      ? await createPersonalLuckBoostOffer(buildPersonalLuckBoostOfferPayload({
        userId: req.user._id,
        now,
        creditedAmount,
        userLang,
      })).catch(() => null)
      : null;

    res.json({ prize: `${creditedAmount} K`, amount: creditedAmount, boostOffer });
  } catch (error) {
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  } finally {
    personalLuckInFlight.delete(userId);
  }
}

async function createPersonalLuckBoostOffer(payload) {
  const { createAdBoostOffer } = require('../adBoostService');
  return createAdBoostOffer(payload);
}

function resetPersonalLuckDrawRuntimeState() {
  personalLuckInFlight.clear();
}

module.exports = {
  buildPersonalLuckBoostOfferPayload,
  buildPersonalLuckRadiancePayload,
  drawPersonalLuck,
  getPersonalLuckAvailability,
  normalizePersonalLuckCreditedAmount,
  resetPersonalLuckDrawRuntimeState,
};
