const {
    claimBattleFinalReportCapacity,
} = require('./finalReportState');
const {
    buildFinalReportRequestPayload,
    getFinalReportWindowState,
    shouldIgnoreFinalReportSequence,
} = require('./reportPayload');
const {
    acceptBattleFinalReport,
} = require('./finalReportAcceptance');
const {
    buildFinalReportAcceptedResponse,
    buildFinalReportEmptyIgnoredResponse,
    buildFinalReportIgnoredResponse,
    buildFinalReportLimitedResponse,
} = require('./responsePayload');
const {
    getRequestLang,
    sendLocalizedError,
    sendServerError,
} = require('./localizedResponse');
const {
    buildFinalReportCapacityClaimInput,
    getFinalReportWindowError,
    isFinalDamageAction,
    refreshFinalReportBattleSnapshotIfNeeded,
    shouldIgnoreEmptyFinalReport,
} = require('./finalReportSubmission');

function createSubmitDamageHandler({
    battleRuntimeStore,
    battleService,
    getCachedBattleDocById,
    refreshBattleSnapshotIfEndTimeChanged,
    getAttendanceRuntimeSnapshot,
}) {
    return async function submitDamage(req, res) {
        try {
            battleRuntimeStore.maybeCleanupExpiredEntries().catch(() => {});
            const { battleId, action } = req.body || {};
            const userLang = getRequestLang(req);

            if (!isFinalDamageAction(action)) {
                return res.json({ ok: true, ignored: true });
            }

            if (!battleId) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Не указан battleId', en: 'Missing battleId' });
            }

            let battle = await getCachedBattleDocById(battleId);
            if (!battle) {
                return sendLocalizedError(res, { status: 404, lang: userLang, ru: 'Бой не найден', en: 'Battle not found' });
            }

            const finalConfig = battleService.getBattleFinalWindowConfig();
            const nowMs = Date.now();
            const finalReportBattleSnapshot = await refreshFinalReportBattleSnapshotIfNeeded({
                battleId,
                battle,
                nowMs,
                refreshBattleSnapshotIfEndTimeChanged,
            });
            battle = finalReportBattleSnapshot.battle;
            const endsAtMs = finalReportBattleSnapshot.endsAtMs;
            const finalWindowState = getFinalReportWindowState({ battle, finalConfig, nowMs });
            const finalWindowError = getFinalReportWindowError(finalWindowState);
            // После конца боя принимаем опоздавшие последние данные.
            // Дальше бой закрывается, а подробный разбор может дособираться отдельно без жёсткого лимита.
            if (finalWindowError) {
                return sendLocalizedError(res, { ...finalWindowError, lang: userLang });
            }

            const attendanceEntry = await getAttendanceRuntimeSnapshot({ battleId, userId: req.user._id });
            if (!attendanceEntry) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Нет участия в бою', en: 'No participation in battle' });
            }

            const {
                finalMarker,
                hasReportPayload,
                normalizedReport,
                safeSequence,
            } = buildFinalReportRequestPayload({
                requestBody: req.body,
                attendanceEntry,
            });
            if (!safeSequence) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Не указан reportSequence', en: 'Missing reportSequence' });
            }

            if (shouldIgnoreEmptyFinalReport({ hasReportPayload, finalMarker })) {
                battleService.tryFinalizeBattleIfReady(battleId).catch(() => {});
                return res.json(buildFinalReportEmptyIgnoredResponse());
            }

            const existingFinalReport = battleRuntimeStore.getCachedFinalReport({
                battleId,
                userId: req.user._id,
            });
            if (shouldIgnoreFinalReportSequence({ existingFinalReport, reportSequence: safeSequence })) {
                return res.json(buildFinalReportIgnoredResponse());
            }

            const capacityClaim = claimBattleFinalReportCapacity(buildFinalReportCapacityClaimInput({
                battleId,
                endsAtMs,
                nowMs,
                finalConfig,
            }));
            if (!capacityClaim.accepted) {
                return res.json(buildFinalReportLimitedResponse({ retryAfterMs: capacityClaim.retryAfterMs }));
            }

            await acceptBattleFinalReport({
                battle,
                battleId,
                userId: req.user._id,
                attendanceEntry,
                normalizedReport,
                hasReportPayload,
                reportSequence: safeSequence,
                nowMs,
            });

            // Финальный подсчёт запускается отдельным таймером после окна приёма.
            // Приём отчётов не должен тормозиться тяжёлым пересчётом всего боя.

            return res.json(buildFinalReportAcceptedResponse());
        } catch (error) {
            console.error('Submit damage error:', error);
            sendServerError(res, req);
        }
    };
}

module.exports = {
    createSubmitDamageHandler,
};
