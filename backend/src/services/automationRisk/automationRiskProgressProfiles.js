const {
  normalizeVector,
  safeNumber,
} = require('./automationRiskScoring');

const PROFIT_ACTIVITY_TYPES = new Set([
  'solar_collect',
  'bridge_contribute',
  'fortune_spin',
  'daily_streak_claim',
  'night_shift',
  'fruit_collect',
  'battle_spark',
]);

function extractActivityEarnings(row) {
  const type = String(row?.type || '').trim();
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  if (!type) return { k: 0, lm: 0, stars: 0 };

  if (type === 'solar_collect') {
    return {
      k: safeNumber(meta.earnedK, 10),
      lm: safeNumber(meta.earnedLm, 100),
      stars: 0,
    };
  }

  if (type === 'night_shift') {
    return {
      k: Math.max(0, safeNumber(meta.earnedK)),
      lm: Math.max(0, safeNumber(meta.earnedLm)),
      stars: Math.max(0, safeNumber(meta.earnedStars)),
    };
  }

  if (type === 'battle_spark') {
    return {
      k: Math.max(0, safeNumber(meta.rewardK)),
      lm: Math.max(0, safeNumber(meta.rewardLumens)),
      stars: 0,
    };
  }

  if (type === 'fruit_collect') {
    const reward = Math.max(0, safeNumber(meta.reward));
    const rewardType = String(meta.rewardType || '').trim();
    return {
      k: rewardType === 'k' ? reward : 0,
      lm: rewardType === 'lumens' ? reward : 0,
      stars: rewardType === 'stars' ? reward : 0,
    };
  }

  if (type === 'solar_share') {
    return {
      k: Math.max(0, safeNumber(meta.kAward, 5)),
      lm: 0,
      stars: Math.max(0, safeNumber(meta.starsAward)),
    };
  }

  return { k: 0, lm: 0, stars: 0 };
}

function buildProgressProfileForUser(user, { activitiesByUser, transactionsByUser, achievementsByUser }) {
  const userId = String(user?._id || '');
  if (!userId) return null;

  const stats = user?.achievementStats && typeof user.achievementStats === 'object'
    ? user.achievementStats
    : {};
  const activityRows = activitiesByUser.get(userId) || [];
  const transactionRows = transactionsByUser.get(userId) || [];
  const achievementRows = achievementsByUser.get(userId) || [];
  const achievementIds = new Set(
    achievementRows
      .map((row) => Number(row?.achievementId))
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  const earnedByActivity = {
    solarCollectK: 0,
    solarCollectLm: 0,
    nightShiftK: 0,
    nightShiftLm: 0,
    battleSparkLm: 0,
    fruitK: 0,
    fruitLm: 0,
    solarShareK: 0,
  };
  let profitableActivityCount = 0;
  for (const row of activityRows) {
    if (PROFIT_ACTIVITY_TYPES.has(String(row?.type || '').trim())) profitableActivityCount += 1;
    const earnings = extractActivityEarnings(row);
    if (row.type === 'solar_collect') {
      earnedByActivity.solarCollectK += earnings.k;
      earnedByActivity.solarCollectLm += earnings.lm;
    } else if (row.type === 'night_shift') {
      earnedByActivity.nightShiftK += earnings.k;
      earnedByActivity.nightShiftLm += earnings.lm;
    } else if (row.type === 'battle_spark') {
      earnedByActivity.battleSparkLm += earnings.lm;
    } else if (row.type === 'fruit_collect') {
      earnedByActivity.fruitK += earnings.k;
      earnedByActivity.fruitLm += earnings.lm;
    } else if (row.type === 'solar_share') {
      earnedByActivity.solarShareK += earnings.k;
    }
  }

  const transactionCredits = {
    battleK: 0,
    fortuneK: 0,
    chatK: 0,
    referralK: 0,
    otherK: 0,
    lm: 0,
  };
  for (const row of transactionRows) {
    if (String(row?.direction || '') !== 'credit' || String(row?.status || 'completed') !== 'completed') continue;
    const amount = Math.max(0, safeNumber(row?.amount));
    const currency = String(row?.currency || 'K').trim();
    const type = String(row?.type || '').trim();
    if (!amount) continue;
    if (currency === 'LM') {
      transactionCredits.lm += amount;
      continue;
    }
    if (currency !== 'K') continue;
    if (type === 'battle') transactionCredits.battleK += amount;
    else if (type === 'fortune' || type === 'lottery') transactionCredits.fortuneK += amount;
    else if (type === 'chat' || type === 'chat_compensation') transactionCredits.chatK += amount;
    else if (type === 'referral' || type === 'referral_blessing') transactionCredits.referralK += amount;
    else transactionCredits.otherK += amount;
  }

  const structureVector = normalizeVector([
    safeNumber(stats.totalChatMinutes),
    safeNumber(stats.totalBridgeStones),
    safeNumber(stats.totalEnergyShared),
    safeNumber(stats.totalCrystalsCollected),
    safeNumber(stats.totalBattlesParticipated),
    safeNumber(stats.totalLumensToTree),
    safeNumber(stats.totalNewsLikes) + safeNumber(stats.totalNewsComments) + safeNumber(stats.totalNewsReposts),
    safeNumber(stats.totalWishesCreated) + safeNumber(stats.totalWishesSupported) + safeNumber(stats.totalWishesFulfilled),
    safeNumber(user?.nightShift?.stats?.anomaliesCleared),
  ]);

  const earningsVector = normalizeVector([
    transactionCredits.battleK,
    transactionCredits.fortuneK,
    transactionCredits.chatK,
    transactionCredits.referralK,
    transactionCredits.otherK + earnedByActivity.solarCollectK + earnedByActivity.nightShiftK + earnedByActivity.fruitK + earnedByActivity.solarShareK,
    earnedByActivity.solarCollectLm,
    earnedByActivity.nightShiftLm,
    earnedByActivity.battleSparkLm,
    earnedByActivity.fruitLm + transactionCredits.lm,
  ]);

  const scaleVector = [
    Math.log1p(achievementIds.size),
    Math.log1p(profitableActivityCount),
    Math.log1p(
      transactionCredits.battleK
      + transactionCredits.fortuneK
      + transactionCredits.chatK
      + transactionCredits.referralK
      + transactionCredits.otherK
      + earnedByActivity.solarCollectK
      + earnedByActivity.nightShiftK
      + earnedByActivity.fruitK
      + earnedByActivity.solarShareK
    ),
    Math.log1p(
      transactionCredits.lm
      + earnedByActivity.solarCollectLm
      + earnedByActivity.nightShiftLm
      + earnedByActivity.battleSparkLm
      + earnedByActivity.fruitLm
    ),
  ];

  return {
    achievementIds,
    structureVector,
    earningsVector,
    scaleVector,
    profitableActivityCount,
  };
}

function buildProgressProfiles(users = [], { activitiesByUser, transactionsByUser, achievementsByUser }) {
  const profiles = new Map();

  for (const user of users) {
    const userId = String(user?._id || '');
    if (!userId) continue;
    const profile = buildProgressProfileForUser(user, { activitiesByUser, transactionsByUser, achievementsByUser });
    if (profile) profiles.set(userId, profile);
  }

  return profiles;
}

module.exports = {
  PROFIT_ACTIVITY_TYPES,
  buildProgressProfileForUser,
  buildProgressProfiles,
  extractActivityEarnings,
};
