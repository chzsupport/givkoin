const {
    attachBattleRewardBoost,
    buildBattleSummaryApiPayload,
} = require('./responsePayload');
const {
    buildBattleFallbackSummarySnapshot,
    buildBattleSummaryPendingPayload,
    findBattleAttendanceEntry,
    shouldFinalizeBeforeSummary,
    isBattleSummaryPending,
} = require('./summaryPayload');
const {
    getRequestLang,
    sendLocalizedError,
    sendServerError,
} = require('./localizedResponse');

function createGetBattleSummaryHandler({
    battleRuntimeStore,
    battleService,
    getSummaryBattleSnapshot,
    getCachedBattleDocById,
    getBattleDocById,
    getAttendanceRuntimeSnapshot,
    setSummaryBattleSnapshot,
    summaryBattleCacheTtlMs = 30000,
}) {
    return async function getBattleSummary(req, res) {
        try {
            const battleId = req.query.battleId;
            const userLang = getRequestLang(req, 'query');
            if (!battleId) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Не указан battleId', en: 'Missing battleId' });
            }
            const nowMs = Date.now();

            const preparedSummary = battleRuntimeStore.getCachedFinalSummary({
                battleId,
                userId: req.user?._id,
            }) || await battleRuntimeStore.getFinalSummary({
                battleId,
                userId: req.user?._id,
            }).catch(() => null);

            if (preparedSummary && typeof preparedSummary === 'object') {
                const payload = buildBattleSummaryApiPayload(preparedSummary, battleId);
                return res.json(await attachBattleRewardBoost({ payload, userId: req.user?._id, userLang }));
            }

            let battle = await getSummaryBattleSnapshot(battleId);
            if (!battle) {
                battle = await getCachedBattleDocById(battleId, { ttlMs: summaryBattleCacheTtlMs }).catch(() => null);
            }
            if (!battle) {
                return sendLocalizedError(res, { status: 404, lang: userLang, ru: 'Бой не найден', en: 'Battle not found' });
            }
            let userAttendanceEntry = findBattleAttendanceEntry(battle, req.user?._id);
            if (battle.status !== 'finished') {
                const finalConfig = battleService.getBattleFinalWindowConfig();
                if (isBattleSummaryPending({ battle, nowMs })) {
                    return res.json(buildBattleSummaryPendingPayload({ battle, battleId }));
                }
                userAttendanceEntry = await getAttendanceRuntimeSnapshot({
                    battleId,
                    userId: req.user?._id,
                }).catch(() => userAttendanceEntry);
                if (shouldFinalizeBeforeSummary({ battle, nowMs, finalConfig })) {
                    battleService.tryFinalizeBattleIfReady(battleId).catch(() => {});
                    battle = await getBattleDocById(battleId);
                    if (battle && String(battle.status || '') === 'finished') {
                        setSummaryBattleSnapshot(battleId, battle);
                    }
                    userAttendanceEntry = findBattleAttendanceEntry(battle, req.user?._id);
                }
            }

            if (!userAttendanceEntry && String(battle?.status || '') === 'finished') {
                const freshBattle = await getBattleDocById(battleId).catch(() => null);
                if (freshBattle) {
                    battle = freshBattle;
                    setSummaryBattleSnapshot(battleId, battle);
                    userAttendanceEntry = findBattleAttendanceEntry(battle, req.user?._id);
                }
            }

            if (!userAttendanceEntry) {
                userAttendanceEntry = await getAttendanceRuntimeSnapshot({
                    battleId,
                    userId: req.user?._id,
                }).catch(() => null);
            }

            if (!userAttendanceEntry) {
                const fallbackLang = getRequestLang(req);
                return sendLocalizedError(res, { status: 404, lang: fallbackLang, ru: 'Участник боя не найден', en: 'Battle participant not found' });
            }

            const acceptedFinalReport = battleRuntimeStore.getCachedFinalReport({
                battleId,
                userId: req.user?._id,
            }) || await battleRuntimeStore.getFinalReport({
                battleId,
                userId: req.user?._id,
            }).catch(() => null);
            const fallbackSummary = buildBattleFallbackSummarySnapshot({
                battle,
                entry: userAttendanceEntry,
                acceptedFinalReport,
            });
            const payload = buildBattleSummaryApiPayload(fallbackSummary, battleId);
            return res.json(await attachBattleRewardBoost({ payload, userId: req.user?._id, userLang }));
        } catch (error) {
            console.error('Get battle summary error:', error);
            return sendServerError(res, req, 'query');
        }
    };
}

module.exports = {
    createGetBattleSummaryHandler,
};
