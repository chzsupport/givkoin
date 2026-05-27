const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildChatPreparingPayload,
    buildChatRoomName,
    getChatPartnerId,
    getWaitingDisconnectState,
    isChatParticipant,
} = require('../services/socket/socketConnectionHandlers');

test('socket connection handlers build chat room name', () => {
    assert.equal(buildChatRoomName('abc'), 'chat-abc');
    assert.equal(buildChatRoomName(12), 'chat-12');
});

test('socket connection handlers detect chat participant by string id', () => {
    const chat = { participants: [1, '2'] };

    assert.equal(isChatParticipant(chat, '1'), true);
    assert.equal(isChatParticipant(chat, 2), true);
    assert.equal(isChatParticipant(chat, 3), false);
    assert.equal(isChatParticipant(null, 1), false);
});

test('socket connection handlers find chat partner without changing id type', () => {
    const chat = { participants: [1, '2'] };

    assert.equal(getChatPartnerId(chat, '1'), '2');
    assert.equal(getChatPartnerId(chat, '2'), 1);
    assert.equal(getChatPartnerId({ participants: ['1'] }, '1'), undefined);
});

test('socket connection handlers build preparing payload', () => {
    assert.deepEqual(
        buildChatPreparingPayload(5, { countdownSeconds: 7, readyAt: 'soon' }),
        {
            chatId: '5',
            countdownSeconds: 7,
            readyAt: 'soon',
        }
    );
});

test('socket connection handlers build strict waiting disconnect state', () => {
    const state = getWaitingDisconnectState({
        _id: 'chat1',
        participants: ['u1', 'u2'],
        waitingState: {
            isWaiting: true,
            disconnectedUserId: 'u2',
            waitingSince: '2026-05-26T10:00:00.000Z',
            activeElapsedSeconds: 30,
        },
        disconnectionCount: {
            u2: 2,
        },
    }, { nowMs: Date.parse('2026-05-26T10:00:20.000Z') });

    assert.deepEqual(state, {
        key: 'chat.partner_connection_lost_wait',
        disconnectedId: 'u2',
        payload: {
            chatId: 'chat1',
            disconnectCount: 2,
            maxDisconnects: 3,
            timeLeft: 40,
            activeElapsedSeconds: 30,
            strictMode: true,
        },
    });
});

test('socket connection handlers build soft waiting disconnect state', () => {
    const state = getWaitingDisconnectState({
        _id: 'chat2',
        participants: ['u1', 'u2'],
        waitingState: {
            isWaiting: true,
            disconnectedUserId: 'u1',
            waitingSince: '2026-05-26T10:00:00.000Z',
            activeElapsedSeconds: 12,
            mode: 'soft',
        },
        disconnectionCount: {
            u1: 1,
        },
    }, { nowMs: Date.parse('2026-05-26T10:00:20.000Z') });

    assert.deepEqual(state, {
        key: 'chat.partner_connection_lost_soft',
        disconnectedId: 'u1',
        payload: {
            chatId: 'chat2',
            disconnectCount: 1,
            maxDisconnects: 0,
            timeLeft: 0,
            activeElapsedSeconds: 12,
            strictMode: false,
        },
    });
});
