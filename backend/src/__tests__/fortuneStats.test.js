const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGlobalFortuneStatsPayload,
  buildUserFortuneStatsPayload,
} = require('../services/fortune/fortuneStats');

test('fortune stats build global payload without exposing users missing nicknames', () => {
  const userMap = new Map([
    ['u1', { nickname: 'One' }],
    ['u2', { nickname: 'Two' }],
    ['u3', { nickname: '' }],
  ]);

  const payload = buildGlobalFortuneStatsPayload({
    allSpins: [
      { user: 'u1', totalSpins: 5, lastSpinAt: '2026-05-25T10:00:00.000Z', lastPrize: '50 K' },
      { user: 'u2', totalSpins: 9, lastSpinAt: '2026-05-25T11:00:00.000Z' },
      { user: 'u3', totalSpins: 20, lastSpinAt: '2026-05-25T12:00:00.000Z', lastPrize: '100 K' },
    ],
    allLotteries: [
      { user: 'u1', tickets: [{}, {}], prizeK: 150 },
      { user: 'u2', tickets: [{}], prizeK: 0 },
      { user: 'u3', tickets: [{}], prizeK: 900 },
    ],
    rouletteTransactions: [{ amount: 10 }, { amount: 50 }],
    lotteryTransactions: [{ amount: 150 }, { amount: 300 }],
    userMap,
    fallbackSpinPrize: 'Spin',
  });

  assert.equal(payload.roulette.totalSpins, 34);
  assert.equal(payload.roulette.activeUsers, 3);
  assert.equal(payload.roulette.totalKIssued, 60);
  assert.deepEqual(payload.roulette.topSpinners, [
    { nickname: 'Two', totalSpins: 9 },
    { nickname: 'One', totalSpins: 5 },
  ]);
  assert.deepEqual(payload.roulette.recentActivity, [
    { nickname: 'Two', lastSpinAt: '2026-05-25T11:00:00.000Z', prize: 'Spin' },
    { nickname: 'One', lastSpinAt: '2026-05-25T10:00:00.000Z', prize: '50 K' },
  ]);
  assert.equal(payload.lottery.totalTickets, 4);
  assert.equal(payload.lottery.totalPrizesPaid, 450);
  assert.deepEqual(payload.lottery.topWinners, [{ nickname: 'One', prize: 150 }]);
  assert.equal(payload.world.maxFortuneWin, 50);
});

test('fortune stats build user payload from transactions and lotteries', () => {
  const payload = buildUserFortuneStatsPayload({
    spinData: { data: { totalSpins: 12, lastSpinAt: '2026-05-25T12:00:00.000Z' } },
    userTransactions: [
      { type: 'fortune', direction: 'credit', amount: 40 },
      { type: 'fortune', direction: 'debit', amount: 5 },
      { type: 'lottery', direction: 'credit', amount: 150 },
      { type: 'lottery', direction: 'debit', amount: 100 },
      { type: 'other', direction: 'credit', amount: 999 },
    ],
    userLotteries: [
      { tickets: [{}, {}], prizeK: 150 },
      { tickets: [{}], prizeK: 0 },
    ],
  });

  assert.deepEqual(payload.roulette, {
    totalSpins: 12,
    lastSpinAt: '2026-05-25T12:00:00.000Z',
    kEarned: 40,
    kSpent: 5,
  });
  assert.deepEqual(payload.lottery, {
    totalTickets: 3,
    totalDraws: 2,
    kWon: 150,
    kSpent: 100,
    totalPrizeK: 150,
  });
  assert.deepEqual(payload.total, {
    kEarned: 190,
    kSpent: 105,
    kNet: 85,
  });
});
