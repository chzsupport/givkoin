const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHAT_IDLE_TIMEOUT_MS,
  getActiveChatDurationSeconds,
  getAdjustedStartedAtAfterWaiting,
  getChatIdleDeadline,
  getCompletedChatDurationSeconds,
  getWaitingSince,
} = require('../services/socket/socketTiming');

test('socket timing reads waiting start only for active waiting state', () => {
  const waitingSince = '2026-05-26T12:05:00.000Z';

  assert.equal(getWaitingSince({ waitingState: { isWaiting: true, waitingSince } }), waitingSince);
  assert.equal(getWaitingSince({ waitingState: { isWaiting: false, waitingSince } }), null);
  assert.equal(getWaitingSince({ waitingState: { isWaiting: true } }), null);
  assert.equal(getWaitingSince(null), null);
});

test('socket timing active duration stops at waiting start', () => {
  const chat = {
    startedAt: new Date('2026-05-26T12:00:00.000Z'),
    waitingState: {
      isWaiting: true,
      waitingSince: '2026-05-26T12:05:00.000Z',
    },
  };

  assert.equal(
    getActiveChatDurationSeconds(chat, { endedAt: new Date('2026-05-26T12:10:00.000Z') }),
    0
  );
  assert.equal(
    getActiveChatDurationSeconds(chat, {
      endedAt: new Date('2026-05-26T12:10:00.000Z'),
      reportedTotalDurationSeconds: 999,
    }),
    300
  );
  assert.equal(
    getActiveChatDurationSeconds(chat, {
      endedAt: new Date('2026-05-26T12:10:00.000Z'),
      reportedTotalDurationSeconds: 120,
    }),
    120
  );
});

test('socket timing shifts chat start by actual waiting time after reconnect', () => {
  const chat = {
    startedAt: new Date('2026-05-26T12:00:00.000Z'),
    waitingState: {
      isWaiting: true,
      waitingSince: '2026-05-26T12:05:00.000Z',
    },
  };

  assert.equal(
    getAdjustedStartedAtAfterWaiting(chat, new Date('2026-05-26T12:08:00.000Z')).toISOString(),
    '2026-05-26T12:03:00.000Z'
  );
  assert.equal(getAdjustedStartedAtAfterWaiting({ startedAt: chat.startedAt }), null);
});

test('socket timing completed duration keeps old reported-duration cap', () => {
  const chat = { startedAt: new Date('2026-05-26T12:00:00.000Z') };
  const endedAt = new Date('2026-05-26T12:10:00.000Z');

  assert.equal(getCompletedChatDurationSeconds(chat, { endedAt }), 0);
  assert.equal(
    getCompletedChatDurationSeconds(chat, { endedAt, reportedTotalDurationSeconds: 1000 }),
    605
  );
  assert.equal(getCompletedChatDurationSeconds(chat, { endedAt, durationSeconds: -5 }), 0);
});

test('socket timing idle deadline uses last activity with started-at fallback', () => {
  const chat = { startedAt: new Date('2026-05-26T12:00:00.000Z') };
  const state = { lastActivityAt: '2026-05-26T12:10:00.000Z' };

  assert.equal(
    getChatIdleDeadline(state, chat),
    new Date('2026-05-26T12:10:00.000Z').getTime() + CHAT_IDLE_TIMEOUT_MS
  );
  assert.equal(
    getChatIdleDeadline(null, chat),
    new Date('2026-05-26T12:00:00.000Z').getTime() + CHAT_IDLE_TIMEOUT_MS
  );
  assert.equal(
    getChatIdleDeadline({ lastActivityAt: 'not-a-date' }, chat),
    null
  );
});
