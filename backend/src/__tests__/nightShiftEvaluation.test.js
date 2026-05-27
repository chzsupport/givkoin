const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateCompletedHours,
} = require('../services/nightShift/nightShiftEvaluation');

const startedAt = '2026-05-24T19:00:00.000Z';
const startedAtMs = new Date(startedAt).getTime();
const hourMs = 60 * 60 * 1000;

test('night shift evaluation pays only completed hours with enough anomalies', () => {
  const result = evaluateCompletedHours(
    {
      startedAt,
      evaluatedHours: [],
      payableHours: 0,
      hourlyAnomalies: {
        0: 60,
        1: 75,
      },
    },
    startedAtMs + (2 * hourMs),
    {
      minAnomaliesPerActiveHour: 60,
      minAnomaliesPerPaidHour: 60,
    }
  );

  assert.deepEqual(result.evaluatedHours, [0, 1]);
  assert.equal(result.payableHours, 2);
  assert.equal(result.shouldClose, false);
  assert.equal(result.closeReason, null);
  assert.equal(result.hourAnomalies, 75);
});

test('night shift evaluation closes the shift when a completed hour is too quiet', () => {
  const result = evaluateCompletedHours(
    {
      startedAt,
      evaluatedHours: [],
      payableHours: 0,
      hourlyAnomalies: {
        0: 59,
      },
    },
    startedAtMs + hourMs,
    {
      minAnomaliesPerActiveHour: 60,
      minAnomaliesPerPaidHour: 60,
    }
  );

  assert.deepEqual(result.evaluatedHours, [0]);
  assert.equal(result.payableHours, 0);
  assert.equal(result.shouldClose, true);
  assert.equal(result.closeReason, 'low_hour_activity');
  assert.equal(result.hourAnomalies, 59);
});

test('night shift evaluation skips hours that were already evaluated', () => {
  const result = evaluateCompletedHours(
    {
      startedAt,
      evaluatedHours: [0],
      payableHours: 1,
      hourlyAnomalies: {
        0: 60,
        1: 60,
        2: 10,
      },
    },
    startedAtMs + (3 * hourMs),
    {
      minAnomaliesPerActiveHour: 60,
      minAnomaliesPerPaidHour: 60,
    }
  );

  assert.deepEqual(result.evaluatedHours, [0, 1, 2]);
  assert.equal(result.payableHours, 2);
  assert.equal(result.shouldClose, true);
  assert.equal(result.closeReason, 'low_hour_activity');
  assert.equal(result.hourAnomalies, 10);
});

test('night shift evaluation keeps invalid start harmless', () => {
  const result = evaluateCompletedHours(
    {
      startedAt: 'bad-date',
      evaluatedHours: [2, 2, 1],
      payableHours: 3.9,
      hourlyAnomalies: { 0: 60 },
    },
    startedAtMs + hourMs
  );

  assert.deepEqual(result.evaluatedHours, [1, 2]);
  assert.equal(result.payableHours, 3);
  assert.equal(result.shouldClose, false);
  assert.equal(result.closeReason, null);
  assert.equal(result.hourAnomalies, 0);
});
