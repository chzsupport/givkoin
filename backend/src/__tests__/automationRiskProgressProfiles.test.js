const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROFIT_ACTIVITY_TYPES,
  buildProgressProfileForUser,
  buildProgressProfiles,
  extractActivityEarnings,
} = require('../services/automationRisk/automationRiskProgressProfiles');

test('automation risk progress profiles expose profit activity types', () => {
  assert.equal(PROFIT_ACTIVITY_TYPES.has('solar_collect'), true);
  assert.equal(PROFIT_ACTIVITY_TYPES.has('chat_message'), false);
});

test('automation risk progress profiles extract activity earnings with old defaults', () => {
  assert.deepEqual(extractActivityEarnings({ type: 'solar_collect', meta: {} }), {
    k: 10,
    lm: 100,
    stars: 0,
  });
  assert.deepEqual(extractActivityEarnings({ type: 'fruit_collect', meta: { rewardType: 'lumens', reward: 12 } }), {
    k: 0,
    lm: 12,
    stars: 0,
  });
  assert.deepEqual(extractActivityEarnings({ type: 'solar_share', meta: {} }), {
    k: 5,
    lm: 0,
    stars: 0,
  });
  assert.deepEqual(extractActivityEarnings({ type: 'unknown', meta: { reward: 99 } }), {
    k: 0,
    lm: 0,
    stars: 0,
  });
});

test('automation risk progress profiles build normalized profile for user', () => {
  const user = {
    _id: 'u1',
    achievementStats: {
      totalChatMinutes: 10,
      totalBridgeStones: 20,
      totalEnergyShared: 0,
      totalCrystalsCollected: 0,
      totalBattlesParticipated: 0,
      totalLumensToTree: 0,
      totalNewsLikes: 1,
      totalNewsComments: 1,
      totalNewsReposts: 0,
    },
    nightShift: {
      stats: {
        anomaliesCleared: 5,
      },
    },
  };
  const activitiesByUser = new Map([[
    'u1',
    [
      { type: 'solar_collect', meta: { earnedK: 10, earnedLm: 100 } },
      { type: 'night_shift', meta: { earnedK: 20, earnedLm: 30 } },
      { type: 'solar_share', meta: { kAward: 5 } },
    ],
  ]]);
  const transactionsByUser = new Map([[
    'u1',
    [
      { direction: 'credit', status: 'completed', amount: 50, currency: 'K', type: 'battle' },
      { direction: 'credit', status: 'completed', amount: 10, currency: 'LM', type: 'bonus' },
      { direction: 'debit', status: 'completed', amount: 999, currency: 'K', type: 'ignored' },
    ],
  ]]);
  const achievementsByUser = new Map([[
    'u1',
    [{ achievementId: 1 }, { achievementId: 'bad' }, { achievementId: 2 }],
  ]]);

  const profile = buildProgressProfileForUser(user, { activitiesByUser, transactionsByUser, achievementsByUser });

  assert.deepEqual(Array.from(profile.achievementIds), [1, 2]);
  assert.equal(profile.profitableActivityCount, 2);
  assert.equal(profile.structureVector.length, 9);
  assert.equal(profile.earningsVector.length, 9);
  assert.equal(profile.scaleVector.length, 4);
  assert.equal(Math.round(profile.structureVector.reduce((sum, value) => sum + value, 0) * 1000) / 1000, 1);
  assert.equal(Math.round(profile.earningsVector.reduce((sum, value) => sum + value, 0) * 1000) / 1000, 1);
});

test('automation risk progress profiles skip users without id', () => {
  const emptyMaps = {
    activitiesByUser: new Map(),
    transactionsByUser: new Map(),
    achievementsByUser: new Map(),
  };

  assert.equal(buildProgressProfileForUser({}, emptyMaps), null);
  assert.deepEqual(Array.from(buildProgressProfiles([{ _id: 'u1' }, {}], emptyMaps).keys()), ['u1']);
});
