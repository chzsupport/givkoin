const {
    getBattleEndsAtMs,
    getBattleReportAcceptEndsAtMs,
} = require('./summaryPayload');

function isCurrentBattleFinalWindow({ battle, nowMs }) {
    const endsAtMs = getBattleEndsAtMs(battle);
    return Number.isFinite(endsAtMs) && Number(nowMs) >= endsAtMs;
}

function shouldFinalizeCurrentBattle({ battle, nowMs, finalConfig }) {
    const reportAcceptEndsAtMs = getBattleReportAcceptEndsAtMs({ battle, finalConfig });
    return Number.isFinite(reportAcceptEndsAtMs) && Number(nowMs) >= reportAcceptEndsAtMs;
}

module.exports = {
    isCurrentBattleFinalWindow,
    shouldFinalizeCurrentBattle,
};
