const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
  WINDOW_SECTORS,
  buildWindowPlan,
} = require('../services/nightShift/nightShiftWindowPlan');

test('night shift window plan keeps anomaly interval constants and sectors', () => {
  assert.equal(ANOMALY_MIN_INTERVAL_SECONDS, 15);
  assert.equal(ANOMALY_MAX_INTERVAL_SECONDS, 45);
  assert.deepEqual(WINDOW_SECTORS.map((row) => row.url), [
    '/fortune',
    '/bridges',
    '/galaxy',
    '/chronicle',
    '/news',
    '/shop',
  ]);
});

test('night shift window plan is deterministic for the same runtime', () => {
  const runtime = {
    startedAt: '2026-05-24T19:00:00.000Z',
    shiftEndsAt: '2026-05-25T06:00:00.000Z',
    windowSecret: 'secret',
  };

  const first = buildWindowPlan(runtime, 0);
  const second = buildWindowPlan(runtime, 0);

  assert.deepEqual(first, second);
  assert.equal(first.index, 0);
  assert.equal(first.startedAt, '2026-05-24T19:00:00.000Z');
  assert.equal(first.endedAt, '2026-05-24T19:05:00.000Z');
  assert.ok(first.anomalies.length > 0);
  assert.ok(first.anomalies.every((row) => String(row.id).startsWith('anomaly_0_')));
});

test('night shift window plan respects a shorter shift end', () => {
  const plan = buildWindowPlan({
    startedAt: '2026-05-24T19:00:00.000Z',
    shiftEndsAt: '2026-05-24T19:03:00.000Z',
    windowSecret: 'secret',
  }, 0);

  assert.equal(plan.endedAt, '2026-05-24T19:03:00.000Z');
  assert.equal(buildWindowPlan({
    startedAt: '2026-05-24T19:00:00.000Z',
    shiftEndsAt: '2026-05-24T19:03:00.000Z',
    windowSecret: 'secret',
  }, 1), null);
});
