const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildAppealPayload,
    buildBlockedUserEntry,
    buildComplaintPayload,
    hoursFromNow,
    replaceBlockedUser,
} = require('../services/socket/socketComplaintHandler');

test('socket complaint handler calculates auto resolve date from injected time', () => {
    const base = Date.parse('2026-05-26T10:00:00.000Z');
    assert.equal(hoursFromNow(24, base).toISOString(), '2026-05-27T10:00:00.000Z');
    assert.equal(hoursFromNow(-1, base).toISOString(), '2026-05-26T09:00:00.000Z');
});

test('socket complaint handler builds quarrel block entry', () => {
    assert.deepEqual(
        buildBlockedUserEntry(42, '2026-06-02T10:00:00.000Z'),
        {
            userId: '42',
            until: '2026-06-02T10:00:00.000Z',
            reason: 'quarrel',
        }
    );
});

test('socket complaint handler replaces old block for same user only', () => {
    const result = replaceBlockedUser([
        { userId: 'u1', until: 'old', reason: 'quarrel' },
        { userId: 'u2', until: 'keep', reason: 'manual' },
    ], 'u1', 'new');

    assert.deepEqual(result, [
        { userId: 'u2', until: 'keep', reason: 'manual' },
        { userId: 'u1', until: 'new', reason: 'quarrel' },
    ]);
});

test('socket complaint handler builds complaint payload with optional appeal id', () => {
    assert.deepEqual(
        buildComplaintPayload({
            from: 1,
            to: 2,
            reason: 'abuse',
            createdAtIso: '2026-05-26T10:00:00.000Z',
            appealId: 'app-1',
            autoResolveAt: '2026-05-27T10:00:00.000Z',
        }),
        {
            from: '1',
            to: '2',
            reason: 'abuse',
            createdAt: '2026-05-26T10:00:00.000Z',
            appealId: 'app-1',
            autoResolveAt: '2026-05-27T10:00:00.000Z',
        }
    );

    assert.deepEqual(
        buildComplaintPayload({
            from: 'u1',
            to: null,
            reason: 'spam',
            createdAtIso: '2026-05-26T10:00:00.000Z',
            autoResolveAt: '2026-05-27T10:00:00.000Z',
        }),
        {
            from: 'u1',
            to: '',
            reason: 'spam',
            createdAt: '2026-05-26T10:00:00.000Z',
            autoResolveAt: '2026-05-27T10:00:00.000Z',
        }
    );
});

test('socket complaint handler builds appeal payload with empty transcript snapshot', () => {
    assert.deepEqual(
        buildAppealPayload({
            chatId: 'chat-1',
            complainant: 'u1',
            againstUser: 'u2',
            reason: 'spam',
            autoResolveAt: '2026-05-27T10:00:00.000Z',
        }),
        {
            chat: 'chat-1',
            complainant: 'u1',
            againstUser: 'u2',
            reason: 'spam',
            description: '',
            messagesSnapshot: [],
            autoResolveAt: '2026-05-27T10:00:00.000Z',
        }
    );
});
