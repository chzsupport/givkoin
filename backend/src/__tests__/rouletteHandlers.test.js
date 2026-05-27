const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRouletteActivityPayload,
  buildRouletteSpinRadiancePayload,
  buildRouletteSpinResponse,
  buildRouletteStatusPayload,
  buildRouletteWinLogPayload,
  calculateRouletteSpinCounts,
  normalizeRouletteSpinState,
  sumRouletteRewardsTodayRows,
} = require('../services/fortune/rouletteHandlers');

test('roulette spin state normalizes counters and pending queue', () => {
  const state = normalizeRouletteSpinState({
    spinsToday: '2.9',
    totalSpins: -5,
    adOfferSpinsToday: 'bad',
    spinsSinceLastStar: 4.7,
    pendingRouletteSpins: null,
  });

  assert.equal(state.spinsToday, 2);
  assert.equal(state.totalSpins, 0);
  assert.equal(state.adOfferSpinsToday, 0);
  assert.equal(state.spinsSinceLastStar, 4);
  assert.deepEqual(state.pendingRouletteSpins, []);
});

test('roulette spin counts keep free and ad spins separate', () => {
  assert.deepEqual(calculateRouletteSpinCounts({
    spinData: { spinsToday: 1, adOfferSpinsToday: 2 },
    dailyFreeSpins: 3,
    availableAdExtraSpins: 2,
  }), {
    countedSpinsToday: 2,
    freeSpinsLeft: 1,
    spinsLeft: 3,
  });
});

test('roulette status payload preserves public response fields', () => {
  const now = new Date('2026-05-25T10:00:00.000Z');
  const plannedSpins = [{ sectorIndex: 1, result: { type: 'k', value: 10, label: '10 K' } }];
  const payload = buildRouletteStatusPayload({
    spinData: {
      spinsToday: 1,
      adOfferSpinsToday: 1,
      totalSpins: 8,
      lastSpinAt: '2026-05-25T09:00:00.000Z',
    },
    now,
    dailyFreeSpins: 3,
    availableAdExtraSpins: 1,
    plannedSpins,
    luckyDayAvailable: true,
  });

  assert.equal(payload.spinsLeft, 3);
  assert.equal(payload.freeSpinsLeft, 2);
  assert.equal(payload.adExtraSpins, 1);
  assert.equal(payload.totalSpins, 8);
  assert.equal(payload.lastSpinAt, '2026-05-25T09:00:00.000Z');
  assert.deepEqual(payload.plannedSpins, plannedSpins);
  assert.equal(payload.luckyDayAvailable, true);
  assert.equal(payload.nextResetAt.getHours(), 0);
});

test('roulette spin response consumes one ad spin only when ad spin is used', () => {
  const now = new Date('2026-05-25T10:00:00.000Z');
  const result = { type: 'k', value: 50, label: '50 K' };
  const response = buildRouletteSpinResponse({
    originalIndex: 4,
    result,
    spinData: { spinsToday: 3, adOfferSpinsToday: 3 },
    dailyFreeSpins: 3,
    usingAdExtraSpin: true,
    availableAdExtraSpins: 2,
    now,
    boostOffer: { id: 'boost-1' },
  });

  assert.equal(response.sectorIndex, 4);
  assert.deepEqual(response.result, result);
  assert.equal(response.freeSpinsLeft, 0);
  assert.equal(response.adExtraSpins, 1);
  assert.equal(response.spinsLeft, 1);
  assert.deepEqual(response.boostOffer, { id: 'boost-1' });
  assert.equal(response.nextResetAt.getHours(), 0);
});

test('roulette reward summary counts only roulette rewards from today rows', () => {
  assert.deepEqual(sumRouletteRewardsTodayRows([
    { type: 'fortune', currency: 'K', amount: 20, description: 'Выигрыш в Колесе Фортуны' },
    { type: 'fortune', currency: 'K', amount: 30, description: 'Fortune Wheel winnings' },
    { type: 'fortune', currency: 'K', amount: 99, description: 'Other fortune reward' },
    { type: 'fortune_roulette', currency: 'STAR', amount: 0.1, description: 'Колесо Фортуны' },
    { type: 'fortune_roulette', currency: 'STAR', amount: -1, description: 'bad' },
  ]), {
    k: 50,
    stars: 0.1,
  });
});

test('roulette side effect payloads keep stable contracts', () => {
  const now = new Date('2026-05-25T10:00:00.000Z');
  const result = { type: 'star', value: 0.1, label: '0.1 stars' };
  const spinData = { _id: 'spin-1', totalSpins: 12, adOfferSpinsToday: 3 };

  assert.deepEqual(buildRouletteSpinRadiancePayload({
    userId: 'u1',
    spinData,
    result,
  }), {
    userId: 'u1',
    amount: 2,
    activityType: 'fortune_spin',
    meta: { spinNumber: 12, resultType: 'star', resultLabel: '0.1 stars' },
    dedupeKey: 'fortune_spin:u1:12',
  });

  assert.deepEqual(buildRouletteActivityPayload({ userId: 'u1', result }), {
    userId: 'u1',
    type: 'fortune_spin',
    minutes: 1,
    meta: {
      resultType: 'star',
      resultLabel: '0.1 stars',
      resultValue: 0.1,
    },
  });

  assert.deepEqual(buildRouletteWinLogPayload({
    userId: 'u1',
    result,
    spinData,
    now,
    originalIndex: 9,
    usingAdExtraSpin: false,
    dailyFreeSpins: 3,
  }), {
    userId: 'u1',
    gameType: 'roulette',
    rewardType: 'star',
    amount: 0.1,
    label: '0.1 stars',
    occurredAt: now,
    meta: {
      spinNumber: 12,
      sectorIndex: 9,
      adOfferSpinNumber: 3,
      usingAdExtraSpin: false,
      eligibleForRouletteDouble: true,
    },
  });
});
