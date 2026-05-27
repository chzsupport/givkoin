const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNextNewsAchievementStats,
  createNewsSideEffects,
  resolveNewsAchievementIds,
} = require('../services/news/newsSideEffects');

function flushDeferredTasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('news side effects build next achievement stats without losing old fields', () => {
  assert.deepEqual(
    buildNextNewsAchievementStats(
      {
        totalNewsLikes: 4,
        totalNewsComments: '2',
        totalNewsReposts: 1,
        totalNewsKEarned: '10.5',
        custom: true,
      },
      { type: 'comment', kAwarded: 1.5 }
    ),
    {
      totalNewsLikes: 4,
      totalNewsComments: 3,
      totalNewsReposts: 1,
      totalNewsKEarned: 12,
      custom: true,
    }
  );
});

test('news side effects resolve achievement ids by old news thresholds', () => {
  assert.deepEqual(resolveNewsAchievementIds({
    totalNewsLikes: 500,
    totalNewsComments: 100,
    totalNewsKEarned: 1000,
  }), [29, 30, 94]);

  assert.deepEqual(resolveNewsAchievementIds({
    totalNewsLikes: 499,
    totalNewsComments: 99,
    totalNewsKEarned: 999,
  }), []);
});

test('news side effects update user stats and schedule threshold achievements', async () => {
  const grants = [];
  const timerDelays = [];
  const updates = [];
  const sideEffects = createNewsSideEffects({
    achievementDelayMinMs: 10,
    achievementDelayMaxMs: 10,
    getUserRowById: async () => ({
      id: 'u1',
      data: {
        achievementStats: {
          totalNewsLikes: 499,
          totalNewsComments: 100,
          totalNewsKEarned: 995,
        },
      },
    }),
    grantAchievementLoader: () => async ({ userId, achievementId, meta }) => {
      grants.push({ userId, achievementId, meta });
    },
    setTimeoutFn: (task, delay) => {
      timerDelays.push(delay);
      task();
      return 1;
    },
    updateUserDataById: async (userId, patch) => {
      updates.push({ userId, patch });
      return { id: userId, data: patch };
    },
  });

  const nextStats = await sideEffects.updateNewsAchievementStats({
    userId: 'u1',
    type: 'like',
    kAwarded: 5,
  });
  await flushDeferredTasks();

  assert.equal(nextStats.totalNewsLikes, 500);
  assert.equal(nextStats.totalNewsComments, 100);
  assert.equal(nextStats.totalNewsKEarned, 1000);
  assert.deepEqual(updates, [{
    userId: 'u1',
    patch: { achievementStats: nextStats },
  }]);
  assert.deepEqual(timerDelays, [10, 10, 10]);
  assert.deepEqual(grants.map((grant) => grant.achievementId), [29, 30, 94]);
});

test('news side effects schedule interaction activity and stats updates with old delays', async () => {
  const activityCalls = [];
  const timerDelays = [];
  const updates = [];
  const sideEffects = createNewsSideEffects({
    activityDelayMs: 5000,
    achievementDelayMinMs: 0,
    achievementDelayMaxMs: 0,
    achievementStatsDelayMs: 60000,
    getUserRowById: async () => ({ id: 'u1', data: { achievementStats: {} } }),
    grantAchievementLoader: () => async () => { },
    recordActivity: async (payload) => {
      activityCalls.push(payload);
    },
    setTimeoutFn: (task, delay) => {
      timerDelays.push(delay);
      task();
      return 1;
    },
    updateUserDataById: async (userId, patch) => {
      updates.push({ userId, patch });
      return { id: userId, data: patch };
    },
  });

  sideEffects.scheduleNewsInteractionSideEffects({
    userId: 'u1',
    postId: 'p1',
    type: 'comment',
    kAwarded: 1,
  });
  await flushDeferredTasks();

  assert.deepEqual(activityCalls, [{
    userId: 'u1',
    type: 'news_comment',
    minutes: 1,
    meta: { postId: 'p1' },
  }]);
  assert.deepEqual(updates, [{
    userId: 'u1',
    patch: {
      achievementStats: {
        totalNewsLikes: 0,
        totalNewsComments: 1,
        totalNewsReposts: 0,
        totalNewsKEarned: 1,
      },
    },
  }]);
  assert.deepEqual(timerDelays, [5000, 60000]);
});
