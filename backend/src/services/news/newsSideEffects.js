const { getUserData } = require('./newsCommon');

const NEWS_ACHIEVEMENT_IDS = Object.freeze({
  likes500: 29,
  comments100: 30,
  k1000: 94,
});

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildNextNewsAchievementStats(stats, { type, kAwarded } = {}) {
  const current = stats && typeof stats === 'object' ? stats : {};
  return {
    ...current,
    totalNewsLikes: toSafeNumber(current.totalNewsLikes) + (type === 'like' ? 1 : 0),
    totalNewsComments: toSafeNumber(current.totalNewsComments) + (type === 'comment' ? 1 : 0),
    totalNewsReposts: toSafeNumber(current.totalNewsReposts) + (type === 'repost' ? 1 : 0),
    totalNewsKEarned: toSafeNumber(current.totalNewsKEarned) + toSafeNumber(kAwarded),
  };
}

function resolveNewsAchievementIds(stats) {
  const current = stats && typeof stats === 'object' ? stats : {};
  const ids = [];

  if (toSafeNumber(current.totalNewsLikes) >= 500) {
    ids.push(NEWS_ACHIEVEMENT_IDS.likes500);
  }
  if (toSafeNumber(current.totalNewsComments) >= 100) {
    ids.push(NEWS_ACHIEVEMENT_IDS.comments100);
  }
  if (toSafeNumber(current.totalNewsKEarned) >= 1000) {
    ids.push(NEWS_ACHIEVEMENT_IDS.k1000);
  }

  return ids;
}

function createNewsSideEffects({
  activityDelayMs = 5000,
  achievementDelayMaxMs = 5 * 60 * 1000,
  achievementDelayMinMs = 60 * 1000,
  achievementStatsDelayMs = 60 * 1000,
  getUserRowById,
  grantAchievementLoader = () => require('../achievementService').grantAchievement,
  random = Math.random,
  recordActivity,
  setTimeoutFn = setTimeout,
  updateUserDataById,
} = {}) {
  function queueNewsDeferredTask(task, delayMs = 0) {
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    setTimeoutFn(() => {
      Promise.resolve()
        .then(task)
        .catch(() => { });
    }, safeDelay);
  }

  function scheduleAchievementGrant({ userId, achievementId, meta = null } = {}) {
    if (!userId || !achievementId) return;

    const minDelay = Math.max(0, Number(achievementDelayMinMs) || 0);
    const maxDelay = Math.max(minDelay, Number(achievementDelayMaxMs) || minDelay);
    const delayRange = Math.max(0, maxDelay - minDelay);
    const delay = minDelay + Math.floor(random() * (delayRange + 1));

    setTimeoutFn(() => {
      const grantAchievement = grantAchievementLoader();
      Promise.resolve(grantAchievement({ userId, achievementId, meta })).catch(() => { });
    }, delay);
  }

  async function updateNewsAchievementStats({ userId, type, kAwarded } = {}) {
    if (!userId || typeof getUserRowById !== 'function' || typeof updateUserDataById !== 'function') return null;

    const userRow = await getUserRowById(userId);
    if (!userRow) return null;

    const data = getUserData(userRow);
    const nextStats = buildNextNewsAchievementStats(data.achievementStats, { type, kAwarded });

    await updateUserDataById(userId, { achievementStats: nextStats });

    for (const achievementId of resolveNewsAchievementIds(nextStats)) {
      scheduleAchievementGrant({ userId, achievementId });
    }

    return nextStats;
  }

  function scheduleNewsInteractionSideEffects({ userId, postId, type, kAwarded } = {}) {
    if (!userId || !type) return;

    queueNewsDeferredTask(async () => {
      await recordActivity({ userId, type: `news_${type}`, minutes: 1, meta: { postId } });
    }, activityDelayMs);

    queueNewsDeferredTask(async () => {
      await updateNewsAchievementStats({ userId, type, kAwarded });
    }, achievementStatsDelayMs);
  }

  return {
    queueNewsDeferredTask,
    scheduleAchievementGrant,
    updateNewsAchievementStats,
    scheduleNewsInteractionSideEffects,
  };
}

module.exports = {
  NEWS_ACHIEVEMENT_IDS,
  buildNextNewsAchievementStats,
  resolveNewsAchievementIds,
  createNewsSideEffects,
};
