const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLotteryResultsPayload,
  buildLotteryStatusPayload,
  buildLotteryTicketRadiancePayload,
  buildLotteryTicketResponse,
  resolveLotteryWinningNumbers,
} = require('../services/fortune/lotteryHandlers');

test('lottery status payload keeps public response fields stable', () => {
  const now = new Date('2026-05-25T10:00:00.000Z');
  const nextDrawAt = new Date('2026-05-25T23:59:00.000Z');
  const payload = buildLotteryStatusPayload({
    lottery: {
      status: 'open',
      tickets: [],
      prizeK: 0,
    },
    tickets: [{ ticketNumber: '01 02 03 04 05 06 07' }],
    maxTicketsPerDay: 10,
    ticketCost: 100,
    nextDrawAt,
    now,
    lotteryConfig: { drawHour: 23, drawMinute: 59 },
    winningNumbers: [1, 2, 3, 4, 5, 6, 7],
    freeTickets: 2,
  });

  assert.equal(payload.ticketsToday, 1);
  assert.equal(payload.maxTicketsPerDay, 10);
  assert.equal(payload.ticketCost, 100);
  assert.equal(payload.drawTimeLabel, '23:59');
  assert.equal(payload.winningNumber, null);
  assert.deepEqual(payload.winningNumbers, []);
  assert.equal(payload.freeTickets, 2);
  assert.equal(payload.nextDrawCountdownMs, nextDrawAt.getTime() - now.getTime());
});

test('lottery ticket response keeps old purchase contract', () => {
  assert.deepEqual(buildLotteryTicketResponse({
    userLang: 'en',
    tickets: [{ ticketNumber: '01 02 03 04 05 06 07' }],
    ticketsToday: 0,
    updatedUserData: { k: 500 },
    normalizedNumbers: [1, 2, 3, 4, 5, 6, 7],
    useFreeTicket: true,
    freeTickets: 2,
    boostOffer: { id: 'boost-1' },
  }), {
    message: 'Ticket purchased!',
    ticketsBought: 1,
    ticketsToday: 1,
    userK: 500,
    ticketNumber: '01 02 03 04 05 06 07',
    numbers: [1, 2, 3, 4, 5, 6, 7],
    freeTicketUsed: true,
    freeTicketsLeft: 1,
    boostOffer: { id: 'boost-1' },
  });
});

test('lottery radiance payload keeps dedupe key stable', () => {
  assert.deepEqual(buildLotteryTicketRadiancePayload({
    userId: 'u1',
    lotteryId: 'lot-1',
    normalizedNumbers: [1, 2, 3, 4, 5, 6, 7],
    now: new Date('2026-05-25T10:00:00.000Z'),
  }), {
    userId: 'u1',
    amount: 3,
    activityType: 'lottery_ticket_buy',
    meta: {
      lotteryId: 'lot-1',
      ticketId: '01 02 03 04 05 06 07:2026-05-25T10:00:00.000Z',
    },
    dedupeKey: 'lottery_ticket_buy:01 02 03 04 05 06 07:2026-05-25T10:00:00.000Z:u1',
  });
});

test('lottery results payload resolves winning numbers and matches', () => {
  const lotteryData = {
    winningNumber: '01 02 03 04 05 06 07',
    tickets: [
      { ticketNumber: '01 02 03 10 11 12 13' },
      { numbers: [4, 5, 6, 20, 21, 22, 23] },
    ],
    prizeK: 150,
    status: 'paid',
    drawDate: '2026-05-25T00:00:00.000Z',
  };
  const winningNumbers = resolveLotteryWinningNumbers(lotteryData);

  assert.deepEqual(winningNumbers, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(buildLotteryResultsPayload(lotteryData, winningNumbers), {
    winningNumber: '01 02 03 04 05 06 07',
    winningNumbers,
    userTickets: [
      { ticketNumber: '01 02 03 10 11 12 13', numbers: undefined, matches: 3 },
      { ticketNumber: undefined, numbers: [4, 5, 6, 20, 21, 22, 23], matches: 3 },
    ],
    prize: 150,
    status: 'paid',
    drawDate: '2026-05-25T00:00:00.000Z',
  });
});
