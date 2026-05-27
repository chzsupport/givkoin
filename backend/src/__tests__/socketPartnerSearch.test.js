const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getSearchSession,
    resetSearchState,
    setSearchSession,
} = require('../services/socket/socketSearchState');
const {
    buildCallToken,
    buildInitialSearchSession,
    buildNextRoundSearchSession,
    clearCurrentCallForInitiator,
    isSearchRoundExhausted,
} = require('../services/socket/socketPartnerSearch');

test('socket partner search builds stable call token', () => {
    assert.equal(
        buildCallToken('u1', 'u2', 12345, 'abc'),
        'u1:u2:12345:abc'
    );
});

test('socket partner search builds initial session with old defaults', () => {
    assert.deepEqual(buildInitialSearchSession('u1', 'socket-1', 12345), {
        userId: 'u1',
        socketId: 'socket-1',
        round: 0,
        candidateIds: [],
        candidateIndex: 0,
        currentTargetId: null,
        currentCallToken: '',
        startedAt: 12345,
    });
});

test('socket partner search builds next round session with normalized candidates', () => {
    assert.deepEqual(
        buildNextRoundSearchSession(
            { userId: 'u1', socketId: 'socket-1', candidateIndex: 7, currentTargetId: 'old' },
            2,
            [{ _id: 42 }, { _id: '' }, {}, { _id: 'u3' }]
        ),
        {
            userId: 'u1',
            socketId: 'socket-1',
            candidateIndex: 0,
            currentTargetId: 'old',
            round: 2,
            candidateIds: ['42', 'u3'],
        }
    );
});

test('socket partner search detects exhausted candidate rounds', () => {
    assert.equal(isSearchRoundExhausted({ candidateIds: ['u1'], candidateIndex: 0 }), false);
    assert.equal(isSearchRoundExhausted({ candidateIds: ['u1'], candidateIndex: 1 }), true);
    assert.equal(isSearchRoundExhausted({ candidateIds: null, candidateIndex: 0 }), true);
});

test('socket partner search clears current call only for matching target and token', () => {
    resetSearchState();

    setSearchSession({
        userId: 'u1',
        currentTargetId: 'u2',
        currentCallToken: 'call-1',
    });

    assert.deepEqual(clearCurrentCallForInitiator('u1', 'u3', 'call-1'), {
        userId: 'u1',
        currentTargetId: 'u2',
        currentCallToken: 'call-1',
    });
    assert.deepEqual(clearCurrentCallForInitiator('u1', 'u2', 'wrong'), {
        userId: 'u1',
        currentTargetId: 'u2',
        currentCallToken: 'call-1',
    });
    assert.deepEqual(clearCurrentCallForInitiator('u1', 'u2', 'call-1'), {
        userId: 'u1',
        currentTargetId: null,
        currentCallToken: '',
    });
    assert.deepEqual(getSearchSession('u1'), {
        userId: 'u1',
        currentTargetId: null,
        currentCallToken: '',
    });
});
