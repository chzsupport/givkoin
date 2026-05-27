const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createGetBattleSummaryHandler,
} = require('../controllers/battle/summaryController');

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
    return createGetBattleSummaryHandler({
        battleRuntimeStore: {
            getCachedFinalSummary: () => null,
            getFinalSummary: async () => null,
            getCachedFinalReport: () => null,
            getFinalReport: async () => null,
        },
        battleService: {
            getBattleFinalWindowConfig: () => ({}),
            tryFinalizeBattleIfReady: () => Promise.resolve(),
        },
        getSummaryBattleSnapshot: async () => null,
        getCachedBattleDocById: async () => null,
        getBattleDocById: async () => null,
        getAttendanceRuntimeSnapshot: async () => null,
        setSummaryBattleSnapshot: () => {},
        ...overrides,
    });
}

test('battle summary controller keeps missing battle id response', async () => {
    const handler = createHandler();
    const res = createFakeResponse();

    const payload = await handler({
        query: { language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 400);
    assert.deepEqual(payload, { message: 'Missing battleId' });
});

test('battle summary controller keeps missing battle response', async () => {
    const handler = createHandler();
    const res = createFakeResponse();

    const payload = await handler({
        query: { battleId: 'battle-missing', language: 'en' },
        user: { _id: 'user-1' },
    }, res);

    assert.equal(res.state.status, 404);
    assert.deepEqual(payload, { message: 'Battle not found' });
});

test('battle summary controller returns prepared summary payload', async () => {
    const handler = createHandler({
        battleRuntimeStore: {
            getCachedFinalSummary: () => ({
                battleId: 'battle-ready',
                result: 'light',
                userDamage: 123,
                rewardK: 11,
                lines: [],
            }),
            getFinalSummary: async () => null,
            getCachedFinalReport: () => null,
            getFinalReport: async () => null,
        },
    });
    const res = createFakeResponse();

    const payload = await handler({
        query: { battleId: 'battle-ready' },
        user: { _id: 'user-1', language: 'ru' },
    }, res);

    assert.equal(payload.ok, true);
    assert.equal(payload.battleId, 'battle-ready');
    assert.equal(payload.userDamage, 123);
    assert.equal(payload.rewardK, 11);
});
