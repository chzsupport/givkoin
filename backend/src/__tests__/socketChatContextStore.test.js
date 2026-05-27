const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearActiveChatContext,
  getActiveChatContext,
  getChatPreparationState,
  resetActiveChatContexts,
  setActiveChatContext,
} = require('../services/socket/socketChatContextStore');

test('socket chat context store normalizes context shape', () => {
  resetActiveChatContexts();

  const context = setActiveChatContext('chat-1', {
    participants: [1, '2', null],
    participantLanguages: { 1: 'ru', 2: 'en' },
    status: '',
    isFriend: true,
    isPreparing: 1,
  });

  assert.deepEqual(context, {
    participants: ['1', '2', 'null'],
    participantLanguages: { 1: 'ru', 2: 'en' },
    startedAt: null,
    status: 'active',
    isFriend: true,
    readyAt: null,
    isPreparing: true,
  });
  assert.deepEqual(getActiveChatContext('chat-1'), context);
});

test('socket chat context store clears one context and resets all contexts', () => {
  resetActiveChatContexts();

  setActiveChatContext('chat-1', { participants: ['u1'] });
  setActiveChatContext('chat-2', { participants: ['u2'] });
  clearActiveChatContext('chat-1');
  assert.equal(getActiveChatContext('chat-1'), null);
  assert.equal(getActiveChatContext('chat-2')?.participants[0], 'u2');

  resetActiveChatContexts();
  assert.equal(getActiveChatContext('chat-2'), null);
});

test('socket chat context preparation state uses explicit readyAt first', () => {
  const now = new Date('2026-05-26T12:00:00.000Z').getTime();
  const readyAt = '2026-05-26T12:00:15.000Z';

  assert.deepEqual(getChatPreparationState({ readyAt }, now), {
    readyAt,
    readyAtMs: new Date(readyAt).getTime(),
    isPreparing: true,
    countdownSeconds: 15,
  });
});

test('socket chat context preparation state falls back to future startedAt', () => {
  const now = new Date('2026-05-26T12:00:00.000Z').getTime();
  const startedAt = new Date('2026-05-26T12:00:05.000Z');

  assert.deepEqual(getChatPreparationState({ startedAt }, now), {
    readyAt: startedAt.toISOString(),
    readyAtMs: startedAt.getTime(),
    isPreparing: true,
    countdownSeconds: 5,
  });
});

test('socket chat context preparation state keeps explicit preparing flag', () => {
  const now = new Date('2026-05-26T12:00:00.000Z').getTime();
  const readyAt = 'not-a-date';

  assert.deepEqual(getChatPreparationState({ preparationState: { readyAt, isPreparing: true } }, now), {
    readyAt,
    readyAtMs: 0,
    isPreparing: true,
    countdownSeconds: 0,
  });
});
