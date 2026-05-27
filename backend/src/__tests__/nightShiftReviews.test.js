const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPenalizedNightShift,
  calculateAppliedPenalty,
  calculateRequestedPenalty,
  createNightShiftReviews,
} = require('../services/nightShift/nightShiftReviews');

test('night shift reviews calculate requested and applied penalties', () => {
  assert.deepEqual(calculateRequestedPenalty({ k: 101, lm: 52, stars: 0.006 }), {
    k: 80,
    lm: 41,
    stars: 0.0048,
  });
  assert.deepEqual(calculateAppliedPenalty({
    k: 50,
    lumens: 100,
    stars: 0.003,
  }, {
    k: 80,
    lm: 41,
    stars: 0.0048,
  }), {
    k: 50,
    lm: 41,
    stars: 0.003,
  });
});

test('night shift reviews subtract penalty from stored shift totals', () => {
  const next = buildPenalizedNightShift({
    stats: {
      totalTimeMs: 120000,
      anomaliesCleared: 20,
      totalEarnings: {
        k: 40,
        lm: 10,
        stars: 0.002,
      },
    },
  }, {
    k: 50,
    lm: 4,
    stars: 0.0015,
  });

  assert.deepEqual(next.stats, {
    totalTimeMs: 120000,
    anomaliesCleared: 20,
    totalEarnings: {
      k: 0,
      lm: 6,
      stars: 0.0005,
    },
  });
});

test('night shift reviews approve suspicious shift without penalty', async () => {
  const patches = [];
  const { reviewSuspiciousShift } = createNightShiftReviews({
    getRuntimeSession: async () => ({
      sessionId: 'session-1',
      userId: 'user-1',
      status: 'ended',
      reviewStatus: 'pending',
    }),
    getUserRowById: async (userId) => ({ id: userId, nickname: 'One' }),
    patchRuntimeSession: async (sessionId, patch) => {
      patches.push({ sessionId, patch });
      return { sessionId, userId: 'user-1', ...patch };
    },
    toIso: (value) => new Date(value).toISOString(),
  });
  const now = new Date('2026-05-25T22:00:00.000Z');

  const result = await reviewSuspiciousShift({
    sessionId: 'session-1',
    action: 'approve',
    adminUserId: 'admin-1',
    now,
  });

  assert.equal(result.penalty, null);
  assert.deepEqual(patches[0], {
    sessionId: 'session-1',
    patch: {
      reviewActionAt: '2026-05-25T22:00:00.000Z',
      reviewActionBy: 'admin-1',
      reviewStatus: 'approved',
      reviewPenalty: null,
    },
  });
});

test('night shift reviews penalize suspicious shift and records debits', async () => {
  const updates = [];
  const transactions = [];
  const patches = [];
  const { reviewSuspiciousShift } = createNightShiftReviews({
    getRuntimeSession: async () => ({
      sessionId: 'session-1',
      userId: 'user-1',
      status: 'ended',
      reviewStatus: 'pending',
      reward: { k: 100, lm: 50, stars: 0.005 },
    }),
    getUserRowById: async () => ({
      id: 'user-1',
      data: {
        k: 60,
        lumens: 100,
        stars: 0.003,
        nightShift: {
          stats: {
            totalTimeMs: 1000,
            anomaliesCleared: 5,
            totalEarnings: { k: 200, lm: 100, stars: 0.01 },
          },
        },
      },
    }),
    getUserData: (row) => row.data,
    getNightShiftFromUserData: (data) => data.nightShift,
    updateUserDataById: async (userId, patch) => updates.push({ userId, patch }),
    recordTransaction: async (payload) => transactions.push(payload),
    patchRuntimeSession: async (sessionId, patch) => {
      patches.push({ sessionId, patch });
      return { sessionId, userId: 'user-1', ...patch };
    },
    toIso: (value) => new Date(value).toISOString(),
  });

  const result = await reviewSuspiciousShift({
    sessionId: 'session-1',
    action: 'penalize',
    now: new Date('2026-05-25T22:10:00.000Z'),
  });

  assert.deepEqual(result.penalty, { k: 60, lm: 40, stars: 0.003 });
  assert.equal(updates[0].userId, 'user-1');
  assert.equal(updates[0].patch.k, 0);
  assert.equal(updates[0].patch.lumens, 60);
  assert.equal(updates[0].patch.stars, 0);
  assert.deepEqual(updates[0].patch.nightShift.stats.totalEarnings, {
    k: 140,
    lm: 60,
    stars: 0.007,
  });
  assert.deepEqual(transactions.map((row) => row.currency), ['K', 'LM', 'STAR']);
  assert.equal(patches[0].patch.reviewStatus, 'penalized');
  assert.deepEqual(patches[0].patch.reviewPenalty, { k: 60, lm: 40, stars: 0.003 });
});

test('night shift reviews process queued final report verification', async () => {
  const patches = [];
  const { processPendingNightShiftFinalReviews } = createNightShiftReviews({
    listRuntimeSessionsByFilters: async (filters) => {
      assert.deepEqual(filters, {
        status: 'ended',
        finalVerificationStatus: 'queued',
        limit: 50,
      });
      return [{
        sessionId: 'session-1',
        finalReport: { pageHits: { '/tree': 1 }, windowReports: [{ index: 1 }] },
        totalPageHits: { '/old': 1 },
      }];
    },
    validateFinalShiftReport: () => ({
      acceptedTotal: 12,
      claimedTotal: 14,
      pageHits: { '/tree': 2 },
      suspicious: true,
      suspiciousWindows: [{ index: 1 }],
    }),
    stripWindowReportsFromFinalPayload: (payload) => {
      const { windowReports, ...rest } = payload;
      return rest;
    },
    patchRuntimeSession: async (sessionId, patch) => {
      patches.push({ sessionId, patch });
      return { sessionId, ...patch };
    },
    toIso: (value) => new Date(value).toISOString(),
  });

  const results = await processPendingNightShiftFinalReviews({
    now: new Date('2026-05-25T22:20:00.000Z'),
  });

  assert.deepEqual(results, [{
    sessionId: 'session-1',
    suspicious: true,
    mismatchCount: 1,
  }]);
  assert.equal(patches[0].patch.reviewStatus, 'pending');
  assert.equal(patches[0].patch.finalVerificationStatus, 'verified');
  assert.equal(patches[0].patch.finalVerificationMismatchCount, 1);
  assert.deepEqual(patches[0].patch.finalReport, {
    pageHits: { '/tree': 1 },
    totalAnomalies: 14,
    verifiedAnomalies: 12,
  });
});
