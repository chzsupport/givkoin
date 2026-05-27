const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EMPTY_WINDOWS_LIMIT,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_WINDOW_SECONDS,
  MAX_SHIFT_MS,
  MIN_ANOMALIES_PER_ACTIVE_HOUR,
  MIN_ANOMALIES_PER_PAID_HOUR,
  getSessionHardEndMs,
  getSyncConfig,
  getWindowBounds,
  safeMs,
} = require('../services/nightShift/nightShiftRuntimeConfig');

test('night shift runtime config keeps sync constants stable', () => {
  assert.equal(HEARTBEAT_WINDOW_SECONDS, 300);
  assert.equal(EMPTY_WINDOWS_LIMIT, 3);
  assert.equal(HEARTBEAT_TIMEOUT_MS, 900000);
  assert.equal(MIN_ANOMALIES_PER_ACTIVE_HOUR, 60);
  assert.equal(MIN_ANOMALIES_PER_PAID_HOUR, 60);
  assert.equal(MAX_SHIFT_MS, 28800000);
  assert.deepEqual(getSyncConfig(), {
    heartbeatWindowSeconds: 300,
    emptyWindowsLimit: 3,
    minAnomaliesPerActiveHour: 60,
    minAnomaliesPerPaidHour: 60,
  });
});

test('night shift runtime config calculates windows and hard end', () => {
  const startedAt = Date.UTC(2026, 4, 24, 19, 0, 0, 0);

  assert.equal(safeMs('bad-date'), null);
  assert.deepEqual(getWindowBounds(startedAt, 2), {
    startedAt: Date.UTC(2026, 4, 24, 19, 10, 0, 0),
    endedAt: Date.UTC(2026, 4, 24, 19, 15, 0, 0),
  });
  assert.equal(getSessionHardEndMs({
    startedAt: new Date(startedAt).toISOString(),
    shiftEndsAt: new Date(Date.UTC(2026, 4, 25, 6, 0, 0, 0)).toISOString(),
  }), startedAt + MAX_SHIFT_MS);
});
