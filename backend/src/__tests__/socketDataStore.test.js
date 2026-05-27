const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getUserData,
  getUserLanguageFromRow,
  mapChatRow,
  toId,
} = require('../services/socket/socketDataStore');

test('socket data store normalizes nested ids without changing legacy fallback', () => {
  assert.equal(toId(null), '');
  assert.equal(toId(42), '42');
  assert.equal(toId({ _id: { value: 'u1' } }), 'u1');
  assert.equal(toId({ id: 'u2' }), 'u2');
  assert.equal(toId({ value: 77 }), '77');
  assert.equal(toId({ toString: () => 'custom-id' }), 'custom-id');
  assert.equal(toId({ toString: () => '[object Object]' }), '');
});

test('socket data store maps chat rows to the old service shape', () => {
  const row = {
    id: 'chat-1',
    participants: ['u1', 'u2'],
    status: 'active',
    started_at: '2026-05-25T10:00:00.000Z',
    ended_at: '2026-05-25T10:05:00.000Z',
    duration: '300',
    messages_count: { u1: 2 },
    ratings: [{ from: 'u1' }],
    complaint: { from: 'u1' },
    waiting_state: { isWaiting: true },
    disconnection_count: { u1: 1 },
    preparation_state: { isPreparing: false },
  };

  const mapped = mapChatRow(row);

  assert.equal(mapped._id, 'chat-1');
  assert.deepEqual(mapped.participants, ['u1', 'u2']);
  assert.equal(mapped.status, 'active');
  assert.equal(mapped.startedAt.toISOString(), '2026-05-25T10:00:00.000Z');
  assert.equal(mapped.endedAt.toISOString(), '2026-05-25T10:05:00.000Z');
  assert.equal(mapped.duration, 300);
  assert.deepEqual(mapped.messagesCount, { u1: 2 });
  assert.deepEqual(mapped.ratings, [{ from: 'u1' }]);
  assert.deepEqual(mapped.complaint, { from: 'u1' });
  assert.deepEqual(mapped.waitingState, { isWaiting: true });
  assert.deepEqual(mapped.disconnectionCount, { u1: 1 });
  assert.deepEqual(mapped.preparationState, { isPreparing: false });
});

test('socket data store keeps safe defaults for incomplete chat rows', () => {
  assert.equal(mapChatRow(null), null);
  assert.deepEqual(mapChatRow({ id: 'chat-2' }), {
    _id: 'chat-2',
    participants: [],
    status: undefined,
    startedAt: null,
    endedAt: null,
    duration: 0,
    messagesCount: {},
    ratings: [],
    complaint: null,
    waitingState: null,
    disconnectionCount: {},
    preparationState: null,
  });
});

test('socket data store reads user data and language with old fallbacks', () => {
  assert.deepEqual(getUserData(null), {});
  assert.deepEqual(getUserData({ data: { language: 'en', k: 5 } }), { language: 'en', k: 5 });
  assert.deepEqual(getUserData({ data: 'bad' }), {});

  assert.equal(getUserLanguageFromRow(null), 'ru');
  assert.equal(getUserLanguageFromRow({ language: 'en', data: { language: 'ru' } }), 'en');
  assert.equal(getUserLanguageFromRow({ data: { language: 'en' } }), 'en');
  assert.equal(getUserLanguageFromRow({ data: {} }), 'ru');
});
