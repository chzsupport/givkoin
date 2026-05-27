const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cloneAcceptedWindowIndexes,
  cloneEvaluatedHours,
  cloneHourlyAnomalies,
  cloneWindowsList,
  normalizeRuntimeSession,
  sumHourlyAnomalies,
} = require('../services/nightShift/nightShiftRuntimeSession');

test('night shift runtime session normalizes legacy window fields', () => {
  assert.deepEqual(cloneWindowsList([
    { index: 2, startedAt: '2026-05-25T19:10:00.000Z', endedAt: '2026-05-25T19:15:00.000Z', anomalyCount: 1.9, pageHits: { '/ru/news': 2 } },
    { index: '1', startedAt: '2026-05-25T19:05:00.000Z', endedAt: '2026-05-25T19:10:00.000Z', anomalyCount: -5 },
    { index: 3, startedAt: '', endedAt: '2026-05-25T19:20:00.000Z' },
  ]), [
    {
      index: 1,
      startedAt: '2026-05-25T19:05:00.000Z',
      endedAt: '2026-05-25T19:10:00.000Z',
      anomalyCount: 0,
      pageHits: {},
      acceptedAt: null,
    },
    {
      index: 2,
      startedAt: '2026-05-25T19:10:00.000Z',
      endedAt: '2026-05-25T19:15:00.000Z',
      anomalyCount: 1,
      pageHits: { '/news': 2 },
      acceptedAt: null,
    },
  ]);
  assert.deepEqual(cloneAcceptedWindowIndexes([3, '1', 3, -4]), [0, 1, 3]);
});

test('night shift runtime session normalizes hourly counters', () => {
  assert.deepEqual(cloneHourlyAnomalies({
    2: '4.8',
    bad: 7,
    '-1': -5,
  }), {
    0: 0,
    2: 4,
  });
  assert.equal(sumHourlyAnomalies({ 0: 5, 1: '2.9', 2: -10 }), 7);
  assert.deepEqual(cloneEvaluatedHours([2, '1', 2, -4]), [0, 1, 2]);
});

test('night shift runtime session keeps normalized public fields stable', () => {
  const normalized = normalizeRuntimeSession({
    sessionId: 123,
    userId: 456,
    windows: [
      { index: 1, startedAt: '2026-05-25T19:05:00.000Z', endedAt: '2026-05-25T19:10:00.000Z' },
    ],
    issuedWindowIndex: -5,
    totalAcceptedAnomalies: '3.9',
    totalReportedAnomalies: '8.2',
    totalPageHits: { '/ru/news?x=1': 2 },
    hourlyAnomalies: { 1: 4 },
    evaluatedHours: [2, 1, 1],
    payableHours: '2.7',
    reusedRetainedSeat: true,
    salaryRates: { k: 120, lm: 80, stars: 0.002 },
    suspiciousWindows: [{
      index: 1,
      reason: 'report_mismatch',
      claimedCount: 3,
      acceptedCount: 1,
      invalidCount: 2,
      details: [{ anomalyId: 'a1', reason: 'wrong_page', pagePath: '/ru/shop' }],
    }],
  });

  assert.equal(normalized.status, 'active');
  assert.equal(normalized.sessionId, '123');
  assert.equal(normalized.userId, '456');
  assert.equal(normalized.issuedWindowIndex, 0);
  assert.equal(normalized.totalAcceptedAnomalies, 3);
  assert.equal(normalized.totalReportedAnomalies, 8);
  assert.deepEqual(normalized.totalPageHits, { '/news': 2 });
  assert.deepEqual(normalized.hourlyAnomalies, { 1: 4 });
  assert.deepEqual(normalized.evaluatedHours, [1, 2]);
  assert.equal(normalized.payableHours, 2);
  assert.equal(normalized.reusedShiftSeat, true);
  assert.equal(normalized.lastAcceptedWindowIndex, 1);
  assert.equal(normalized.acceptedWindowIndexes, undefined);
  assert.equal(normalized.windows, undefined);
  assert.deepEqual(normalized.salaryRates, { k: 120, lm: 80, stars: 0.002 });
  assert.equal(normalized.suspiciousWindows[0].details[0].pagePath, '/shop');
});
