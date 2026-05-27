const {
    applyBattleReportToAttendanceEntry,
    isBattleReportEmpty,
    isBattleReportReadyForEntry,
    normalizeBattleReport,
} = require('./reportPayload');
const { normalizeLang, pickLang } = require('./localizedResponse');

function createBattleReportMerger({
    getAttendanceRuntimeSnapshot,
    runtimeStore,
    attendanceRuntimeTtlMs,
} = {}) {
    async function mergeBattleReportIntoAttendanceState({
        battleId,
        userId,
        entry = null,
        report = null,
        reportSequence = null,
        markFinal = false,
        lang = 'ru',
    }) {
        const baseEntry = entry || await getAttendanceRuntimeSnapshot({ battleId, userId });
        if (!baseEntry) {
            return {
                entry: null,
                accepted: false,
                ignored: false,
                message: pickLang(lang, 'Нет участия в бою', 'No participation in battle'),
            };
        }

        const safeSequence = Math.max(0, Math.floor(Number(reportSequence) || 0));
        if (!safeSequence) {
            return {
                entry: baseEntry,
                accepted: false,
                ignored: false,
                message: pickLang(lang, 'Не указан reportSequence', 'Missing reportSequence'),
            };
        }

        const lastAcceptedSequence = Math.max(0, Math.floor(Number(baseEntry.lastAcceptedReportSequence) || 0));
        if (safeSequence <= lastAcceptedSequence) {
            return { entry: baseEntry, accepted: false, ignored: true };
        }

        const normalizedReport = normalizeBattleReport(report, baseEntry.syncIntervalSeconds || 60);
        if (isBattleReportEmpty(normalizedReport)) {
            return { entry: baseEntry, accepted: false, ignored: true };
        }

        const receivedAt = new Date();
        if (!markFinal && !isBattleReportReadyForEntry(baseEntry, receivedAt)) {
            return { entry: baseEntry, accepted: false, ignored: true, message: 'Report window not reached' };
        }

        const nextEntry = applyBattleReportToAttendanceEntry(baseEntry, normalizedReport, {
            reportSequence: safeSequence,
            receivedAt,
            markFinal,
        });

        await runtimeStore.upsertAttendanceState({
            battleId,
            userId,
            state: nextEntry,
            ttlMs: attendanceRuntimeTtlMs,
        }).catch(() => {});

        return { entry: nextEntry, accepted: true, ignored: false };
    }

    return {
        mergeBattleReportIntoAttendanceState,
    };
}

module.exports = {
    createBattleReportMerger,
};
