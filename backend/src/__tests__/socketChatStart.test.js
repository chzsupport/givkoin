const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildChatInsertPayload,
    buildChatPreparingPayload,
    buildInitialChatContext,
    buildPreparedChatContext,
    getChatPrepareDelayMs,
} = require('../services/socket/socketChatStart');

test('socket chat start keeps legacy prepare delay parsing', () => {
    assert.equal(getChatPrepareDelayMs(undefined), 15000);
    assert.equal(getChatPrepareDelayMs(''), 15000);
    assert.equal(getChatPrepareDelayMs('0'), 15000);
    assert.equal(getChatPrepareDelayMs('-1'), 0);
    assert.equal(getChatPrepareDelayMs('2500'), 2500);
});

test('socket chat start builds chat insert payload', () => {
    assert.deepEqual(
        buildChatInsertPayload({
            chatId: 'chat-1',
            user1Id: 12,
            user2Id: '34',
            readyAtIso: '2026-05-26T10:00:15.000Z',
            nowIso: '2026-05-26T10:00:00.000Z',
        }),
        {
            id: 'chat-1',
            participants: ['12', '34'],
            status: 'active',
            started_at: '2026-05-26T10:00:15.000Z',
            disconnection_count: { 12: 0, 34: 0 },
            created_at: '2026-05-26T10:00:00.000Z',
            updated_at: '2026-05-26T10:00:00.000Z',
        }
    );
});

test('socket chat start builds initial preparing context', () => {
    const context = buildInitialChatContext({
        user1Id: 12,
        user2Id: 34,
        participantLanguages: { 12: 'ru', 34: 'en' },
        readyAtIso: '2026-05-26T10:00:15.000Z',
        isFriendSnapshot: true,
        prepareDelayMs: 15000,
    });

    assert.deepEqual(context, {
        participants: ['12', '34'],
        participantLanguages: { 12: 'ru', 34: 'en' },
        startedAt: '2026-05-26T10:00:15.000Z',
        status: 'active',
        isFriend: true,
        readyAt: '2026-05-26T10:00:15.000Z',
        isPreparing: true,
    });
});

test('socket chat start builds prepared context without losing previous fields', () => {
    const context = buildPreparedChatContext({
        previousContext: { customFlag: 'keep-me', isPreparing: true },
        user1Id: 'u1',
        user2Id: 'u2',
        participantLanguages: { u1: 'ru', u2: 'en' },
        readyAtIso: '2026-05-26T10:00:15.000Z',
        isFriendSnapshot: false,
    });

    assert.deepEqual(context, {
        customFlag: 'keep-me',
        participants: ['u1', 'u2'],
        participantLanguages: { u1: 'ru', u2: 'en' },
        startedAt: '2026-05-26T10:00:15.000Z',
        status: 'active',
        isFriend: false,
        readyAt: '2026-05-26T10:00:15.000Z',
        isPreparing: false,
    });
});

test('socket chat start builds chat preparing payload', () => {
    assert.deepEqual(
        buildChatPreparingPayload({
            chatId: 123,
            countdownSeconds: 15,
            readyAtIso: '2026-05-26T10:00:15.000Z',
        }),
        {
            chatId: '123',
            countdownSeconds: 15,
            readyAt: '2026-05-26T10:00:15.000Z',
        }
    );
});
