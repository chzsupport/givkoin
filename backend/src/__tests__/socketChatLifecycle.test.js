const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFriendSnapshotContext,
    buildPrimedChatContext,
    getChatStartedAtIso,
    normalizeContextParticipants,
    normalizeTranscriptParticipants,
} = require('../services/socket/socketChatLifecycle');

test('socket chat lifecycle keeps transcript participant ids unfiltered', () => {
    assert.deepEqual(normalizeTranscriptParticipants({ participants: [1, null, '', false] }), ['1', 'null', '', 'false']);
    assert.deepEqual(normalizeTranscriptParticipants({ participants: 'u1' }), []);
});

test('socket chat lifecycle filters only empty context participant ids', () => {
    assert.deepEqual(normalizeContextParticipants({ participants: [1, null, '', false] }), ['1', 'null', 'false']);
    assert.deepEqual(normalizeContextParticipants(null), []);
});

test('socket chat lifecycle builds primed context with the old socket shape', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');

    assert.deepEqual(
        buildPrimedChatContext(
            { status: '' },
            { participantLanguages: { u1: 'ru' }, isFriendSnapshot: true },
            { readyAt: '2026-05-26T12:00:15.000Z', isPreparing: false },
            ['u1'],
            now
        ),
        {
            participants: ['u1'],
            participantLanguages: { u1: 'ru' },
            startedAt: '2026-05-26T12:00:00.000Z',
            status: 'active',
            isFriend: true,
            readyAt: '2026-05-26T12:00:15.000Z',
            isPreparing: false,
        }
    );
});

test('socket chat lifecycle preserves friend snapshot context fallbacks', () => {
    assert.deepEqual(
        buildFriendSnapshotContext(
            { status: '', startedAt: new Date('2026-05-26T11:00:00.000Z') },
            {
                participants: ['old'],
                participantLanguages: { old: 'en' },
                startedAt: 'old-start',
                status: 'active',
                readyAt: 'old-ready',
                isPreparing: true,
            },
            [],
            false,
            { readyAt: null, isPreparing: false }
        ),
        {
            participants: ['old'],
            participantLanguages: { old: 'en' },
            startedAt: 'old-start',
            status: 'active',
            readyAt: 'old-ready',
            isPreparing: true,
            isFriend: false,
        }
    );
});

test('socket chat lifecycle formats chat start time with fallback date', () => {
    assert.equal(
        getChatStartedAtIso({}, new Date('2026-05-26T12:00:00.000Z')),
        '2026-05-26T12:00:00.000Z'
    );
    assert.equal(
        getChatStartedAtIso({ startedAt: '2026-05-26T13:00:00.000Z' }, new Date('2026-05-26T12:00:00.000Z')),
        '2026-05-26T13:00:00.000Z'
    );
});
