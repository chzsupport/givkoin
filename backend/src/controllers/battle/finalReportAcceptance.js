const battleRuntimeStore = require('../../services/battleRuntimeStore');
const { publishBattleSummary } = require('../../services/battleSummaryService');
const {
    getBattleFinalReportExpectedCount,
    noteBattleFinalReportAccepted,
} = require('./finalReportState');
const {
    buildFinalReportPreviewEntry,
    buildFinalReportStoreRecord,
} = require('./reportPayload');

async function acceptBattleFinalReport({
    battle,
    battleId,
    userId,
    attendanceEntry,
    normalizedReport,
    hasReportPayload,
    reportSequence,
    nowMs,
    runtimeStore = battleRuntimeStore,
    publishSummary = publishBattleSummary,
    getExpectedFinalReportCount = getBattleFinalReportExpectedCount,
    noteAccepted = noteBattleFinalReportAccepted,
} = {}) {
    const acceptedAtIso = new Date(nowMs).toISOString();

    await runtimeStore.upsertFinalReport({
        battleId,
        userId,
        report: buildFinalReportStoreRecord({
            battleId: String(battleId),
            userId: String(userId),
            reportSequence,
            normalizedReport,
            hasReportPayload,
            acceptedAt: acceptedAtIso,
            attendanceEntry,
        }),
    });

    const previewEntry = buildFinalReportPreviewEntry({
        attendanceEntry,
        hasReportPayload,
        normalizedReport,
        reportSequence,
        acceptedAt: acceptedAtIso,
    });

    const expectedFinalReportCount = getExpectedFinalReportCount(battle);

    await publishSummary({
        battle,
        userId,
        entry: previewEntry,
        attendanceCount: expectedFinalReportCount,
        detailReady: false,
        updatedAt: acceptedAtIso,
    }).catch(() => null);

    noteAccepted({
        battleId,
        userId,
        expectedCount: expectedFinalReportCount,
        nowMs,
    });

    return {
        acceptedAtIso,
        expectedFinalReportCount,
        previewEntry,
    };
}

module.exports = {
    acceptBattleFinalReport,
};
