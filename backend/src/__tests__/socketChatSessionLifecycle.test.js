const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDisconnectEndedPayload,
    buildFinalizationResult,
    buildNextDisconnectionCount,
    buildWaitingState,
    normalizeFinalizationParticipants,
} = require('../services/socket/socketChatSessionLifecycle');

test('socket chat session lifecycle builds disconnect end payload', () => {
    assert.deepEqual(
        buildDisconnectEndedPayload({
            reason: 'partner_not_returned',
            duration: 123,
            waitingUserId: 42,
            disconnectedUserId: null,
            warning: { lifeDeducted: true, warningCount30Days: '2' },
        }),
        {
            reason: 'partner_not_returned',
            duration: 123,
            waitingUserId: '42',
            disconnectedUserId: '',
            lifeDeducted: true,
            warningCount30Days: 2,
        }
    );
});

test('socket chat session lifecycle builds strict waiting state', () => {
    assert.deepEqual(
        buildWaitingState({
            disconnectedUserId: 'u1',
            waitingSince: 1000,
            activeElapsedSeconds: 45,
        }),
        {
            isWaiting: true,
            mode: 'strict',
            disconnectedUserId: 'u1',
            waitingSince: 1000,
            activeElapsedSeconds: 45,
        }
    );
});

test('socket chat session lifecycle increments disconnection count on existing object', () => {
    const counts = { u1: 2 };
    const result = buildNextDisconnectionCount(counts, 'u1');

    assert.equal(result.disconnectionCount, counts);
    assert.deepEqual(result, {
        disconnectionCount: { u1: 3 },
        newDisconnectCount: 3,
    });
});

test('socket chat session lifecycle normalizes finalization participants', () => {
    assert.deepEqual(normalizeFinalizationParticipants({ participants: [1, null, '', false] }), ['1', 'null', 'false']);
    assert.deepEqual(normalizeFinalizationParticipants({ participants: 'u1' }), []);
});

test('socket chat session lifecycle builds finalization result', () => {
    assert.deepEqual(
        buildFinalizationResult({
            durationSeconds: 31,
            participants: ['u1', 'u2'],
            persistTranscript: true,
        }),
        {
            durationSeconds: 31,
            participants: ['u1', 'u2'],
            isFriends: true,
            durationMinutes: 1,
        }
    );
});
