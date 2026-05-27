const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SESSION_MODEL,
  SHIFT_SUMMARY_MODEL,
  buildSessionDocId,
  buildShiftSummaryDocId,
  normalizeShiftSummary,
} = require('../services/nightShift/nightShiftDocuments');

test('night shift document helpers keep model names and ids stable', () => {
  assert.equal(SESSION_MODEL, 'NightShiftRuntimeSession');
  assert.equal(SHIFT_SUMMARY_MODEL, 'NightShiftRuntimeSummary');
  assert.equal(buildSessionDocId('abc'), 'night_shift_runtime:abc');
  assert.equal(buildShiftSummaryDocId(' 2026-05-24 '), 'night_shift_summary:2026-05-24');
});

test('night shift document helpers normalize summary counters', () => {
  assert.equal(normalizeShiftSummary(null), null);
  assert.deepEqual(normalizeShiftSummary({
    shiftKey: 20260524,
    shiftStartsAt: '2026-05-24T19:00:00.000Z',
    shiftEndsAt: '2026-05-25T06:00:00.000Z',
    activeUsersCountSnapshot: '10.9',
    seatLimit: -5,
    occupiedSeats: 3.8,
    activeServingCount: '2',
    retainedSeats: 'bad',
  }), {
    shiftKey: '20260524',
    shiftStartsAt: '2026-05-24T19:00:00.000Z',
    shiftEndsAt: '2026-05-25T06:00:00.000Z',
    activeUsersCountSnapshot: 10,
    seatLimit: 0,
    occupiedSeats: 3,
    activeServingCount: 2,
    retainedSeats: 0,
  });
});
