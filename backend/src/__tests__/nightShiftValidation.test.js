const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldSendHourCheckpoint,
  validateFinalShiftReport,
  validateHeartbeatWindow,
} = require('../services/nightShift/nightShiftValidation');
const {
  buildWindowPlan,
} = require('../services/nightShift/nightShiftWindowPlan');

test('night shift validation accepts only anomalies from the issued window', () => {
  const windowPlan = {
    startedAt: '2026-05-25T19:00:00.000Z',
    endedAt: '2026-05-25T19:05:00.000Z',
    anomalies: [
      {
        id: 'a1',
        sectorUrl: '/ru/news',
        spawnAt: '2026-05-25T19:01:00.000Z',
      },
      {
        id: 'a2',
        sectorUrl: '/en/shop',
        spawnAt: '2026-05-25T19:02:00.000Z',
      },
    ],
  };

  const result = validateHeartbeatWindow(windowPlan, [
    { anomalyId: 'a1', pagePath: '/ru/news/post-1?x=1', clearedAt: '2026-05-25T19:01:30.000Z' },
    { anomalyId: 'a2', pagePath: '/en/bridges', clearedAt: '2026-05-25T19:02:30.000Z' },
    { anomalyId: 'a3', pagePath: '/ru/news', clearedAt: '2026-05-25T19:03:00.000Z' },
    { anomalyId: 'a4', pagePath: '/ru/news/post-2', clearedAt: '2026-05-25T19:06:00.000Z' },
  ], 5);

  assert.equal(result.acceptedCount, 1);
  assert.equal(result.claimedCount, 5);
  assert.deepEqual(result.accepted, [{
    anomalyId: 'a1',
    pagePath: '/news/post-1',
    clearedAt: '2026-05-25T19:01:30.000Z',
  }]);
  assert.deepEqual(result.invalid.map((row) => row.reason), ['wrong_page', 'unexpected_anomaly', 'unexpected_anomaly']);
  assert.deepEqual(result.pageHits, { '/news/post-1': 1 });
  assert.equal(result.suspicious, true);
});

test('night shift validation normalizes localized page paths', () => {
  const result = validateHeartbeatWindow({
    startedAt: '2026-05-25T19:00:00.000Z',
    endedAt: '2026-05-25T19:05:00.000Z',
    anomalies: [{
      id: 'a1',
      sectorUrl: '/ru/fortune/roulette',
      spawnAt: '2026-05-25T19:01:00.000Z',
    }],
  }, [
    { anomalyId: 'a1', pagePath: '/ru/fortune/roulette', clearedAt: '2026-05-25T19:01:30.000Z' },
  ], 1);

  assert.deepEqual(result.accepted, [{
    anomalyId: 'a1',
    pagePath: '/fortune/roulette',
    clearedAt: '2026-05-25T19:01:30.000Z',
  }]);
  assert.equal(result.suspicious, false);
});

test('night shift hourly checkpoints stay on each twelfth window', () => {
  assert.equal(shouldSendHourCheckpoint(0), false);
  assert.equal(shouldSendHourCheckpoint(10), false);
  assert.equal(shouldSendHourCheckpoint(11), true);
  assert.equal(shouldSendHourCheckpoint(23), true);
});

test('night shift final validation accepts matching window reports', () => {
  const runtime = {
    startedAt: '2026-05-25T19:00:00.000Z',
    shiftEndsAt: '2026-05-25T20:00:00.000Z',
    windowSecret: 'validation-secret',
  };
  const firstWindow = buildWindowPlan(runtime, 0);
  const anomaly = firstWindow.anomalies[0];

  const result = validateFinalShiftReport(runtime, {
    totalAnomalies: 1,
    endedAt: '2026-05-25T19:05:00.000Z',
    windowReports: [{
      index: 0,
      startedAt: firstWindow.startedAt,
      endedAt: firstWindow.endedAt,
      resolvedAnomalies: [{
        anomalyId: anomaly.id,
        pagePath: anomaly.sectorUrl,
        clearedAt: anomaly.spawnAt,
      }],
    }],
  });

  assert.equal(result.claimedTotal, 1);
  assert.equal(result.acceptedTotal, 1);
  assert.equal(result.suspicious, false);
  assert.deepEqual(result.suspiciousWindows, []);
});

test('night shift final validation reports unexpected windows without changing shape', () => {
  const result = validateFinalShiftReport({
    startedAt: '2026-05-25T19:00:00.000Z',
    shiftEndsAt: '2026-05-25T19:05:00.000Z',
    windowSecret: 'validation-secret',
  }, {
    totalAnomalies: 1,
    endedAt: '2026-05-25T19:10:00.000Z',
    windowReports: [{
      index: 2,
      startedAt: '2026-05-25T19:10:00.000Z',
      endedAt: '2026-05-25T19:15:00.000Z',
      resolvedAnomalies: [{ anomalyId: 'late', pagePath: '/ru/news' }],
    }],
  });

  assert.equal(result.claimedTotal, 1);
  assert.equal(result.acceptedTotal, 0);
  assert.equal(result.suspicious, true);
  assert.equal(result.suspiciousWindows.length, 1);
  assert.equal(result.suspiciousWindows[0].reason, 'unexpected_window');
  assert.equal(result.suspiciousWindows[0].details[0].pagePath, '/news');
});
