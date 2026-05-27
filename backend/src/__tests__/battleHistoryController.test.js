const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createGetUserBattleHistoryHandler,
} = require('../controllers/battle/historyController');

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

test('battle history controller keeps old battles response shape', async () => {
    const handler = createGetUserBattleHistoryHandler({
        listBattleDocs: async (options) => {
            assert.deepEqual(options, { pageSize: 2000 });
            return [{
                _id: 'battle-1',
                status: 'finished',
                result: 'light',
                endedAt: '2026-01-01T00:00:00.000Z',
                attendance: [{ user: 'user-1', damage: 100 }],
            }];
        },
    });
    const res = createFakeResponse();

    const payload = await handler({ user: { _id: 'user-1' } }, res);

    assert.equal(Array.isArray(payload.battles), true);
    assert.equal(payload.battles.length, 1);
    assert.equal(payload.battles[0].battleId, 'battle-1');
});
