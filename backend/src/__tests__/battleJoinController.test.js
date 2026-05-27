const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createJoinBattleHandler,
} = require('../controllers/battle/joinBattleController');

function createFakeResponse() {
    const state = {};
    return {
        state,
        status(code) {
            state.status = code;
            return this;
        },
        json(payload) {
            state.payload = payload;
            return payload;
        },
    };
}

function createHandler(overrides = {}) {
    return createJoinBattleHandler({
        getCachedBattleDocById: async () => null,
        ensureBattleAttendanceReady: async () => ({}),
        setHeartbeatBattleSnapshot: () => {},
        clearSummaryBattleSnapshot: () => {},
        resolveJoinBattleCandidate: async () => null,
        reserveBattleJoinSlot: () => ({ queued: false, retryAfterMs: 0 }),
        releaseBattleJoinSlot: () => {},
        ...overrides,
    });
}

test('battle join controller keeps no active battle response', async () => {
    const handler = createHandler();
    const res = createFakeResponse();

    const payload = await handler({
        body: { language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'No active battle' });
});

test('battle join controller keeps ended battle response before queue', async () => {
    let reserved = false;
    const handler = createHandler({
        resolveJoinBattleCandidate: async () => ({
            _id: 'battle-ended',
            status: 'active',
            endsAt: '2026-01-01T00:00:00.000Z',
        }),
        reserveBattleJoinSlot: () => {
            reserved = true;
            return { queued: false, retryAfterMs: 0 };
        },
    });
    const res = createFakeResponse();

    const payload = await handler({
        body: { language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'Battle has already ended' });
    assert.equal(reserved, false);
});

test('battle join controller keeps queued response shape', async () => {
    const handler = createHandler({
        resolveJoinBattleCandidate: async () => ({
            _id: 'battle-queued',
            status: 'active',
            durationSeconds: 1800,
            attendanceCount: 12,
        }),
        reserveBattleJoinSlot: () => ({ queued: true, retryAfterMs: 1234 }),
    });
    const res = createFakeResponse();

    const payload = await handler({
        body: { language: 'ru' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 202);
    assert.deepEqual(payload, {
        ok: true,
        queued: true,
        retryAfterMs: 1234,
        battleId: 'battle-queued',
        durationSeconds: 1800,
        attendanceCount: 12,
    });
});
