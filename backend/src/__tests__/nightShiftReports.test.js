const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPageHitsFromResolved,
  getTotalAnomaliesFromWindowReports,
  mergePageHits,
  normalizeFinalWindowReports,
  normalizePageHits,
  normalizeResolvedAnomalies,
  normalizeSuspiciousWindows,
  stripWindowReportsFromFinalPayload,
} = require('../services/nightShift/nightShiftReports');

test('night shift reports normalize resolved anomalies and page hits', () => {
  const rows = [
    { anomalyId: 'a1', pagePath: '/ru/news?x=1#top', clearedAt: 123 },
    { anomalyId: 'a1', pagePath: '/shop' },
    { anomalyId: 'a2', pagePath: 'en/fortune/roulette/', clearedAt: '2026-05-24T19:00:00.000Z' },
    { anomalyId: '', pagePath: '/bridges' },
  ];

  assert.deepEqual(normalizeResolvedAnomalies(rows), [
    { anomalyId: 'a1', pagePath: '/news', clearedAt: '123' },
    { anomalyId: 'a2', pagePath: '/fortune/roulette', clearedAt: '2026-05-24T19:00:00.000Z' },
  ]);
  assert.deepEqual(buildPageHitsFromResolved(rows), {
    '/news': 1,
    '/fortune/roulette': 1,
  });
});

test('night shift reports normalize and merge page hits', () => {
  assert.deepEqual(normalizePageHits({
    '/ru/news?x=1': '2',
    'en/shop/': 1.8,
    '/empty': 0,
    '': 10,
  }), {
    '/news': 2,
    '/shop': 1,
  });

  assert.deepEqual(mergePageHits({ '/news': 2 }, {
    '/ru/news': 3,
    '/bridges': 1,
  }), {
    '/news': 5,
    '/bridges': 1,
  });
});

test('night shift reports normalize suspicious windows safely', () => {
  const details = Array.from({ length: 22 }, (_, index) => ({
    anomalyId: `bad_${index}`,
    reason: index % 2 ? 'wrong_page' : '',
    pagePath: '/ru/news/item?from=test',
  }));

  const windows = normalizeSuspiciousWindows([
    null,
    {
      index: -5,
      reason: ' report_mismatch ',
      claimedCount: -10,
      acceptedCount: 2.8,
      invalidCount: 3.2,
      reportedAt: 456,
      details,
    },
  ]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].index, 0);
  assert.equal(windows[0].reason, 'report_mismatch');
  assert.equal(windows[0].claimedCount, 0);
  assert.equal(windows[0].acceptedCount, 2);
  assert.equal(windows[0].invalidCount, 3);
  assert.equal(windows[0].reportedAt, '456');
  assert.equal(windows[0].details.length, 20);
  assert.equal(windows[0].details[0].pagePath, '/news/item');
});

test('night shift reports normalize final windows and strip raw window payload', () => {
  const finalReport = {
    totalAnomalies: 100,
    windowReports: [
      {
        index: 2,
        startedAt: '2026-05-24T19:05:00.000Z',
        endedAt: '2026-05-24T19:10:00.000Z',
        resolvedAnomalies: [{ anomalyId: 'a2', pagePath: '/ru/shop' }],
      },
      {
        index: 1,
        startedAt: '2026-05-24T19:00:00.000Z',
        endedAt: '2026-05-24T19:05:00.000Z',
        resolvedAnomalies: [
          { anomalyId: 'a1', pagePath: '/en/bridges' },
          { anomalyId: 'a1', pagePath: '/en/bridges' },
        ],
      },
      { index: 3, startedAt: '', endedAt: '2026-05-24T19:15:00.000Z' },
    ],
  };

  const windows = normalizeFinalWindowReports(finalReport.windowReports);

  assert.deepEqual(windows.map((row) => row.index), [1, 2]);
  assert.equal(getTotalAnomaliesFromWindowReports(windows), 2);
  assert.deepEqual(stripWindowReportsFromFinalPayload(finalReport), { totalAnomalies: 100 });
});
