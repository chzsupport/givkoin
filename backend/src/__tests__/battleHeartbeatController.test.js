const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createBattleHeartbeatHandler,
} = require('../controllers/battle/heartbeatController');

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
    return createBattleHeartbeatHandler({
        getActiveHeartbeatBattleSnapshot: async () => null,
        getAttendanceRuntimeSnapshot: async () => null,
        mergeBattleReportIntoAttendanceState: async () => ({ accepted: false, ignored: false }),
        ...overrides,
    });
}

test('battle heartbeat controller keeps missing battle id response', async () => {
    const handler = createHandler();
    const res = createFakeResponse();

    const payload = await handler({
        body: { language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'Missing battleId' });
});

test('battle heartbeat controller keeps inactive battle response', async () => {
    const handler = createHandler({
        getActiveHeartbeatBattleSnapshot: async () => ({ _id: 'battle-1', status: 'finished' }),
    });
    const res = createFakeResponse();

    const payload = await handler({
        body: { battleId: 'battle-1', language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'Battle is not active' });
});

test('battle heartbeat controller keeps ended battle response shape', async () => {
    const handler = createHandler({
        getActiveHeartbeatBattleSnapshot: async () => ({
            _id: 'battle-ended',
            status: 'active',
            endsAt: '2026-01-01T00:00:00.000Z',
        }),
    });
    const res = createFakeResponse();

    const payload = await handler({
        body: { battleId: 'battle-ended' },
        user: { _id: 'user-1', language: 'ru' },
    }, res);

    assert.equal(res.state.status, 409);
    assert.deepEqual(payload, {
        ok: false,
        battleEnded: true,
        timeLeftMs: 0,
    });
});

test('battle heartbeat controller keeps no participation response for report', async () => {
    const handler = createHandler({
        getActiveHeartbeatBattleSnapshot: async () => ({
            _id: 'battle-active',
            status: 'active',
            endsAt: '2999-01-01T00:00:00.000Z',
        }),
        getAttendanceRuntimeSnapshot: async () => null,
    });
    const res = createFakeResponse();

    const payload = await handler({
        body: { battleId: 'battle-active', report: {}, reportSequence: 1, language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'No participation in battle' });
});
