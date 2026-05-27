const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createSubmitDamageHandler,
} = require('../controllers/battle/finalReportController');

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
    return createSubmitDamageHandler({
        battleRuntimeStore: {
            maybeCleanupExpiredEntries: () => Promise.resolve(),
            getCachedFinalReport: () => null,
        },
        battleService: {
            getBattleFinalWindowConfig: () => ({}),
            tryFinalizeBattleIfReady: () => Promise.resolve(),
        },
        getCachedBattleDocById: async () => null,
        refreshBattleSnapshotIfEndTimeChanged: async () => ({}),
        getAttendanceRuntimeSnapshot: async () => null,
        ...overrides,
    });
}

test('battle final report controller keeps non-final damage ignored', async () => {
    const handler = createHandler();
    const res = createFakeResponse();

    const payload = await handler({
        body: { action: 'click' },
        user: { _id: 'user-1', language: 'ru' },
    }, res);

    assert.deepEqual(payload, { ok: true, ignored: true });
    assert.deepEqual(res.state.payload, { ok: true, ignored: true });
});

test('battle final report controller keeps missing battle id response', async () => {
    const handler = createHandler();
    const res = createFakeResponse();

    const payload = await handler({
        body: { action: 'final', language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'Missing battleId' });
});
