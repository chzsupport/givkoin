const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createGetCurrentBattleHandler,
} = require('../controllers/battle/currentBattleController');

function createFakeResponse() {
    const state = {};
    return {
        state,
        json(payload) {
            state.payload = payload;
            return payload;
        },
        status(code) {
            state.status = code;
            return this;
        },
    };
}

function createHandler(overrides = {}) {
    return createGetCurrentBattleHandler({
        battleService: {
            getBattleFinalWindowConfig: () => ({ reportAcceptSeconds: 30 }),
            tryFinalizeBattleIfReady: () => Promise.resolve(),
        },
        getCachedCurrentBattleShared: async () => ({ battle: null, upcoming: null }),
        getCachedCurrentBattlePersonal: async () => ({ attendanceEntry: null, personalState: null }),
        ...overrides,
    });
}

test('battle current controller keeps none response', async () => {
    const upcoming = { startsAt: '2999-01-01T00:00:00.000Z' };
    const handler = createHandler({
        getCachedCurrentBattleShared: async () => ({ battle: null, upcoming }),
    });
    const res = createFakeResponse();

    const payload = await handler({ user: { _id: 'user-1' } }, res);

    assert.deepEqual(payload, { status: 'none', upcoming });
});

test('battle current controller keeps active response shape', async () => {
    const handler = createHandler({
        getCachedCurrentBattleShared: async () => ({
            battle: {
                _id: 'battle-active',
                status: 'active',
                durationSeconds: 120,
                attendanceCount: 5,
                endsAt: '2999-01-01T00:00:00.000Z',
            },
            upcoming: null,
        }),
        getCachedCurrentBattlePersonal: async () => ({
            attendanceEntry: { joinedAt: '2026-01-01T00:00:00.000Z' },
            personalState: { confirmedDamage: 10 },
        }),
    });
    const res = createFakeResponse();

    const payload = await handler({ user: { _id: 'user-1' } }, res);

    assert.equal(payload.status, 'active');
    assert.equal(payload.battle._id, 'battle-active');
    assert.deepEqual(payload.battle.personalState, { confirmedDamage: 10 });
});

test('battle current controller keeps final window response and finalize trigger', async () => {
    let finalizeBattleId = null;
    const handler = createHandler({
        battleService: {
            getBattleFinalWindowConfig: () => ({ reportAcceptSeconds: 0 }),
            tryFinalizeBattleIfReady: (battleId) => {
                finalizeBattleId = battleId;
                return Promise.resolve();
            },
        },
        getCachedCurrentBattleShared: async () => ({
            battle: {
                _id: 'battle-final-window',
                status: 'active',
                durationSeconds: 120,
                attendanceCount: 5,
                endsAt: '2026-01-01T00:00:00.000Z',
            },
            upcoming: null,
        }),
        getCachedCurrentBattlePersonal: async () => ({
            attendanceEntry: { joinedAt: '2026-01-01T00:00:00.000Z' },
            personalState: { confirmedDamage: 20 },
        }),
    });
    const res = createFakeResponse();

    const payload = await handler({ user: { _id: 'user-1' } }, res);

    assert.equal(payload.status, 'final_window');
    assert.equal(payload.battle._id, 'battle-final-window');
    assert.equal(finalizeBattleId, 'battle-final-window');
});
