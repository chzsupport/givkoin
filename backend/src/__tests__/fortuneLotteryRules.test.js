const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countTicketMatches,
  formatDrawTimeLabel,
  formatLotteryNumbers,
  formatLotteryNumbersForDisplay,
  getDrawAt,
  getNextDrawAt,
  getPrizeForMatches,
  normalizeTicketNumbers,
  parseLotteryNumbers,
} = require('../services/fortune/lotteryRules');

test('lottery rules normalize exactly seven unique numbers from 1 to 49', () => {
  assert.deepEqual(normalizeTicketNumbers([1, 2, 3, 4, 5, 6, 49]), [1, 2, 3, 4, 5, 6, 49]);
  assert.deepEqual(normalizeTicketNumbers('1 2 3 4 5 6 7'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(normalizeTicketNumbers('1234567'), [1, 2, 3, 4, 5, 6, 7]);

  assert.equal(normalizeTicketNumbers([1, 2, 3, 4, 5, 6]), null);
  assert.equal(normalizeTicketNumbers([1, 2, 3, 4, 5, 6, 50]), null);
  assert.equal(normalizeTicketNumbers([1, 2, 3, 4, 5, 6, 6]), null);
});

test('lottery rules keep old number parsing and display format stable', () => {
  assert.deepEqual(parseLotteryNumbers('01,02,03,04,05,06,07'), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(formatLotteryNumbers([1, 2, 3, 10, 11, 12, 49]), '01 02 03 10 11 12 49');
  assert.equal(formatLotteryNumbersForDisplay([1, 2, 3, 10, 11, 12, 49]), '1 2 3 10 11 12 49');
});

test('lottery rules calculate draw time with configured fallback', () => {
  const beforeDraw = new Date(2026, 4, 25, 10, 30, 0, 0);
  const afterDraw = new Date(2026, 4, 25, 12, 30, 0, 0);
  const config = { drawHour: 12, drawMinute: 15 };

  assert.equal(getDrawAt(beforeDraw, config).getHours(), 12);
  assert.equal(getDrawAt(beforeDraw, config).getMinutes(), 15);
  assert.equal(getNextDrawAt(beforeDraw, config).toISOString(), getDrawAt(beforeDraw, config).toISOString());
  assert.equal(getNextDrawAt(afterDraw, config).getDate(), 26);
  assert.equal(formatDrawTimeLabel(config), '12:15');
  assert.equal(formatDrawTimeLabel({ drawHour: 'bad', drawMinute: 'bad' }), '23:59');
});

test('lottery rules count matches and read configured prizes only', () => {
  assert.equal(countTicketMatches([1, 2, 3, 4, 5, 6, 7], [7, 6, 20, 21, 22, 23, 24]), 2);
  assert.equal(countTicketMatches('01 02 03 04 05 06 07', [1, 3, 5, 8, 9, 10, 11]), 3);
  assert.equal(countTicketMatches([], [1, 2, 3]), 0);

  assert.equal(getPrizeForMatches(3, { payoutByMatches: { 3: 150 } }), 150);
  assert.equal(getPrizeForMatches(4, { payoutByMatches: { 4: -1 } }), 0);
  assert.equal(getPrizeForMatches(7, null), 0);
});
