const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveBattleSummaryWaveCount,
  resolveBattleSummaryWaveDelayMs,
  resolveBattleSummaryWaveIndex,
  resolveBattleSummaryReleaseState,
} = require('../utils/battleFinalWindow');

test('battle summary wave count is always at least one', () => {
  assert.equal(resolveBattleSummaryWaveCount(10), 10);
  assert.equal(resolveBattleSummaryWaveCount(0), 1);
  assert.equal(resolveBattleSummaryWaveCount('bad'), 10);
});

test('battle summary wave index wraps sync slots without changing the 60-slot contract', () => {
  assert.equal(resolveBattleSummaryWaveIndex({ syncSlot: 0, syncSlotCount: 60, waveCount: 10 }), 0);
  assert.equal(resolveBattleSummaryWaveIndex({ syncSlot: 30, syncSlotCount: 60, waveCount: 10 }), 5);
  assert.equal(resolveBattleSummaryWaveIndex({ syncSlot: 59, syncSlotCount: 60, waveCount: 10 }), 9);
  assert.equal(resolveBattleSummaryWaveIndex({ syncSlot: 60, syncSlotCount: 60, waveCount: 10 }), 0);
});

test('battle summary release state keeps report window and wave delay math stable', () => {
  const state = resolveBattleSummaryReleaseState({
    endsAtMs: 100000,
    reportAcceptSeconds: 30,
    summaryPrepSeconds: 10,
    syncSlot: 30,
    syncSlotCount: 60,
  });

  assert.equal(state.waveCount, 10);
  assert.equal(state.waveIndex, 5);
  assert.equal(state.waveDelayMs, 1000);
  assert.equal(state.releaseAtMs, 135000);
});

test('battle summary wave delay is zero when preparation window is zero', () => {
  assert.equal(resolveBattleSummaryWaveDelayMs({ summaryPrepSeconds: 0, waveCount: 10 }), 0);
});
