const {
    buildCurrentBattleActiveResponsePayload,
    buildCurrentBattleFinalWindowResponsePayload,
} = require('./responsePayload');
const {
    sendServerError,
} = require('./localizedResponse');
const {
    isCurrentBattleFinalWindow,
    shouldFinalizeCurrentBattle,
} = require('./currentBattleState');

function createGetCurrentBattleHandler({
    battleService,
    getCachedCurrentBattleShared,
    getCachedCurrentBattlePersonal,
}) {
    return async function getCurrentBattle(req, res) {
        try {
            const nowMs = Date.now();
            const { battle, upcoming } = await getCachedCurrentBattleShared(nowMs);
            if (!battle) {
                return res.json({ status: 'none', upcoming });
            }
            const { attendanceEntry, personalState } = await getCachedCurrentBattlePersonal({
                battleId: battle._id,
                userId: req.user?._id,
                fallbackUser: req.user || null,
                nowMs,
            });

            if (isCurrentBattleFinalWindow({ battle, nowMs })) {
                const finalConfig = battleService.getBattleFinalWindowConfig();
                if (shouldFinalizeCurrentBattle({ battle, nowMs, finalConfig })) {
                    battleService.tryFinalizeBattleIfReady(battle._id).catch(() => {});
                }
                return res.json(buildCurrentBattleFinalWindowResponsePayload({
                    battle,
                    attendanceEntry,
                    personalState,
                    nowMs,
                }));
            }

            return res.json(buildCurrentBattleActiveResponsePayload({
                battle,
                attendanceEntry,
                personalState,
                nowMs,
            }));
        } catch (error) {
            console.error('Get current battle error:', error);
            return sendServerError(res, req);
        }
    };
}

module.exports = {
    createGetCurrentBattleHandler,
};
