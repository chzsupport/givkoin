const { buildBattleSummarySnapshot } = require('../../services/battleSummaryService');
const { applyAcceptedFinalReportToEntry } = require('./reportPayload');

function findBattleAttendanceEntry(battle, userId) {
    const safeUserId = String(userId || '');
    if (!safeUserId) return null;
    const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
    return attendance.find((row) => String(row?.user || '') === safeUserId) || null;
}

function getBattleEndsAtMs(battle) {
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    return Number.isFinite(endsAtMs) ? endsAtMs : NaN;
}

function getBattleReportAcceptEndsAtMs({ battle, finalConfig }) {
    const endsAtMs = getBattleEndsAtMs(battle);
    if (!Number.isFinite(endsAtMs)) return NaN;
    return endsAtMs + (Number(finalConfig?.reportAcceptSeconds || 60) * 1000);
}

function isBattleSummaryPending({ battle, nowMs }) {
    const endsAtMs = getBattleEndsAtMs(battle);
    return Number.isFinite(endsAtMs) && Number(nowMs) < endsAtMs;
}

function shouldFinalizeBeforeSummary({ battle, nowMs, finalConfig }) {
    const reportAcceptEndsAtMs = getBattleReportAcceptEndsAtMs({ battle, finalConfig });
    return Number.isFinite(reportAcceptEndsAtMs) && Number(nowMs) >= reportAcceptEndsAtMs;
}

function buildBattleSummaryPendingPayload({ battle, battleId }) {
    return {
        ok: false,
        pending: true,
        battleId: String(battle?._id || battleId),
        retryAfterMs: 1000,
    };
}

function buildBattleFallbackSummarySnapshot({ battle, entry, acceptedFinalReport }) {
    return buildBattleSummarySnapshot({
        battle,
        entry: applyAcceptedFinalReportToEntry(entry, acceptedFinalReport),
        detailReady: false,
    });
}

module.exports = {
    buildBattleFallbackSummarySnapshot,
    buildBattleSummaryPendingPayload,
    findBattleAttendanceEntry,
    getBattleEndsAtMs,
    getBattleReportAcceptEndsAtMs,
    isBattleSummaryPending,
    shouldFinalizeBeforeSummary,
};
