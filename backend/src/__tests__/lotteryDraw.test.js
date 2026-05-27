const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectLotteriesForDraw,
  summarizeLotteryTickets,
} = require('../services/fortune/lotteryDraw');

test('lottery draw selects only open or closed lotteries for the draw day', () => {
  const drawDate = new Date('2026-05-25T00:00:00.000Z');
  const rows = [
    { _id: 'open', drawDate: drawDate.toISOString(), status: 'open' },
    { _id: 'closed', drawDate: drawDate.toISOString(), status: 'closed' },
    { _id: 'paid', drawDate: drawDate.toISOString(), status: 'paid' },
    { _id: 'other-day', drawDate: '2026-05-24T00:00:00.000Z', status: 'open' },
  ];

  assert.deepEqual(selectLotteriesForDraw(rows, drawDate).map((row) => row._id), ['open', 'closed']);
  assert.deepEqual(selectLotteriesForDraw(null, drawDate), []);
});

test('lottery draw summarizes ticket prizes and max matches', () => {
  const winningNumbers = [1, 2, 3, 4, 5, 6, 7];
  const tickets = [
    { numbers: [1, 2, 3, 10, 11, 12, 13] },
    { ticketNumber: '01 02 03 04 05 20 21' },
    { ticketNumber: '40 41 42 43 44 45 46' },
  ];
  const lotteryConfig = {
    payoutByMatches: {
      3: 150,
      5: 600,
    },
  };

  assert.deepEqual(summarizeLotteryTickets(tickets, winningNumbers, lotteryConfig), {
    totalPrize: 750,
    maxMatches: 5,
  });
  assert.deepEqual(summarizeLotteryTickets(null, winningNumbers, lotteryConfig), {
    totalPrize: 0,
    maxMatches: 0,
  });
});
