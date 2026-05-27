const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createBattleController,
} = require('../controllers/battle/battleControllerFactory');

test('battle controller factory keeps old exported handler names', () => {
    const controller = createBattleController({
        services: {
            battleService: {
                getCurrentBattle: async () => null,
                getUpcomingBattle: async () => null,
                getBattleFinalWindowConfig: () => ({}),
                tryFinalizeBattleIfReady: async () => {},
            },
        },
        stores: {
            battleRuntimeStore: {
                getCachedAttendanceState: () => null,
                maybeCleanupExpiredEntries: async () => {},
                getCachedFinalSummary: () => null,
                getFinalSummary: async () => null,
                getCachedFinalReport: () => null,
                getFinalReport: async () => null,
            },
        },
        documentStore: {
            getDocByModelAndId: async () => null,
            listAllDocsByModel: async () => [],
        },
    });

    assert.deepEqual(Object.keys(controller).sort(), [
        'battleHeartbeat',
        'getBattleSummary',
        'getCurrentBattle',
        'getUserBattleHistory',
        'joinBattle',
        'submitDamage',
    ]);
    for (const handler of Object.values(controller)) {
        assert.equal(typeof handler, 'function');
    }
});
