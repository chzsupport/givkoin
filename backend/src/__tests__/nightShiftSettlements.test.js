const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinalSettlementReward,
  buildSettledNightShift,
  createNightShiftSettlements,
} = require('../services/nightShift/nightShiftSettlements');

test('night shift settlements build final reward from blessing result', () => {
  assert.deepEqual(buildFinalSettlementReward({
    k: 100,
    lm: 50,
    stars: 0.00125,
    source: 'runtime',
  }, {
    k: 120,
    lumens: 75,
  }), {
    k: 120,
    lm: 75,
    stars: 0.0013,
    source: 'runtime',
  });
});

test('night shift settlements add reward to stored shift totals', () => {
  const next = buildSettledNightShift({
    pendingSettlement: { sessionId: 'session-1' },
    stats: {
      totalTimeMs: 1000,
      anomaliesCleared: 7,
      totalEarnings: {
        k: 10,
        lm: 20,
        stars: 0.001,
      },
    },
  }, {
    k: 15,
    lm: 30,
    stars: 0.0025,
  });

  assert.equal(next.pendingSettlement, null);
  assert.deepEqual(next.stats, {
    totalTimeMs: 1000,
    anomaliesCleared: 7,
    totalEarnings: {
      k: 25,
      lm: 50,
      stars: 0.0035,
    },
  });
});

test('night shift settlements settle empty payable rows without user update', async () => {
  const saved = [];
  const { processDueNightShiftSettlements } = createNightShiftSettlements({
    listRuntimeSessionsByFilters: async (filters) => {
      assert.deepEqual(filters, { settlementStatus: 'queued' });
      return [{
        sessionId: 'session-empty',
        settlementStatus: 'queued',
        settlementDueAt: '2026-05-25T21:00:00.000Z',
        payableHours: 0,
      }];
    },
    saveRuntimeSession: async (sessionId, runtime) => saved.push({ sessionId, runtime }),
    safeMs: (value) => new Date(value).getTime(),
    toIso: (value) => new Date(value).toISOString(),
    updateUserDataById: async () => {
      throw new Error('should_not_update_user');
    },
  });

  const result = await processDueNightShiftSettlements({
    now: new Date('2026-05-25T22:00:00.000Z'),
  });

  assert.deepEqual(result, []);
  assert.equal(saved[0].sessionId, 'session-empty');
  assert.equal(saved[0].runtime.settlementStatus, 'settled');
  assert.equal(saved[0].runtime.settledAt, '2026-05-25T22:00:00.000Z');
});

test('night shift settlements apply reward, transactions, radiance and activity', async () => {
  const updates = [];
  const saved = [];
  const transactions = [];
  const referrals = [];
  const radiance = [];
  const activities = [];

  const { processDueNightShiftSettlements } = createNightShiftSettlements({
    listRuntimeSessionsByFilters: async () => [{
      sessionId: 'session-1',
      userId: 'user-1',
      settlementStatus: 'queued',
      settlementDueAt: '2026-05-25T21:00:00.000Z',
      reward: { k: 100, lm: 50, stars: 0.002 },
      payableHours: 2,
      totalAcceptedAnomalies: 130,
    }],
    getUserRowById: async () => ({
      id: 'user-1',
      nickname: 'One',
      data: {
        k: 10,
        lumens: 20,
        stars: 1.5,
        nightShift: {
          pendingSettlement: { sessionId: 'session-1' },
          stats: {
            totalTimeMs: 1000,
            anomaliesCleared: 8,
            totalEarnings: { k: 1, lm: 2, stars: 0.001 },
          },
        },
      },
    }),
    getUserData: (row) => row.data,
    getNightShiftFromUserData: (data) => data.nightShift,
    getBaseRewardMultiplier: async (userId) => {
      assert.equal(userId, 'user-1');
      return 1.2;
    },
    applyTreeBlessingToReward: async (payload) => {
      assert.deepEqual({
        userId: payload.userId,
        k: payload.k,
        lumens: payload.lumens,
        baseMultiplier: payload.baseMultiplier,
      }, {
        userId: 'user-1',
        k: 100,
        lumens: 50,
        baseMultiplier: 1.2,
      });
      return { k: 120, lumens: 60 };
    },
    updateUserDataById: async (userId, patch) => updates.push({ userId, patch }),
    recordTransaction: async (payload) => transactions.push(payload),
    awardReferralBlessingExternal: async (payload) => referrals.push(payload),
    awardRadianceForActivity: async (payload) => radiance.push(payload),
    recordActivity: async (payload) => activities.push(payload),
    saveRuntimeSession: async (sessionId, runtime) => saved.push({ sessionId, runtime }),
    safeMs: (value) => new Date(value).getTime(),
    toIso: (value) => new Date(value).toISOString(),
  });

  const result = await processDueNightShiftSettlements({
    now: new Date('2026-05-25T22:00:00.000Z'),
  });

  assert.deepEqual(result, [{
    userId: 'user-1',
    nickname: 'One',
    sessionId: 'session-1',
    reward: { k: 120, lm: 60, stars: 0.002 },
    payableHours: 2,
  }]);
  assert.equal(updates[0].userId, 'user-1');
  assert.equal(updates[0].patch.k, 130);
  assert.equal(updates[0].patch.lumens, 80);
  assert.equal(updates[0].patch.stars, 1.502);
  assert.deepEqual(updates[0].patch.nightShift.stats.totalEarnings, {
    k: 121,
    lm: 62,
    stars: 0.003,
  });
  assert.deepEqual(transactions.map((row) => row.currency), ['K', 'STAR']);
  assert.deepEqual(referrals[0], {
    receiverUserId: 'user-1',
    amount: 120,
    sourceType: 'night_shift',
    relatedEntity: 'session-1',
  });
  assert.deepEqual(radiance.map((row) => row.activityType), ['night_shift_anomaly', 'night_shift_hour']);
  assert.equal(activities[0].minutes, 120);
  assert.equal(saved[0].runtime.settlementStatus, 'settled');
});

test('night shift settlements mark failed row as error', async () => {
  const saved = [];
  const { processDueNightShiftSettlements } = createNightShiftSettlements({
    listRuntimeSessionsByFilters: async () => [{
      sessionId: 'session-missing-user',
      userId: 'missing',
      settlementStatus: 'queued',
      settlementDueAt: '2026-05-25T21:00:00.000Z',
      reward: { k: 100, lm: 50, stars: 0.002 },
      payableHours: 1,
    }],
    getUserRowById: async () => null,
    saveRuntimeSession: async (sessionId, runtime) => saved.push({ sessionId, runtime }),
    safeMs: (value) => new Date(value).getTime(),
  });

  const result = await processDueNightShiftSettlements({
    now: new Date('2026-05-25T22:00:00.000Z'),
  });

  assert.deepEqual(result, []);
  assert.equal(saved[0].sessionId, 'session-missing-user');
  assert.equal(saved[0].runtime.settlementStatus, 'error');
  assert.equal(saved[0].runtime.settlementError, 'night_shift_settlement_user_not_found');
});
