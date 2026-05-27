const { getBattleEndsAtMs } = require('./summaryPayload');

function isFinalDamageAction(action) {
    return action === 'final';
}

function getFinalReportWindowError(finalWindowState) {
    if (finalWindowState?.reason === 'missing_end_time') {
        return {
            status: 400,
            ru: 'Неизвестно время окончания боя',
            en: 'Battle end time missing',
        };
    }
    if (finalWindowState?.reason === 'battle_active') {
        return {
            status: 400,
            ru: 'Бой ещё активен',
            en: 'Battle is still active',
        };
    }
    if (finalWindowState?.reason === 'window_closed') {
        return {
            status: 400,
            ru: 'Окно финального отчёта закрыто',
            en: 'Final report window closed',
        };
    }
    return null;
}

function buildFinalReportCapacityClaimInput({ battleId, endsAtMs, nowMs, finalConfig }) {
    return {
        battleId,
        endsAtMs,
        nowMs,
        windowMs: Number(finalConfig?.reportRetryIntervalMs) || 2000,
        capacity: Number(finalConfig?.reportWindowCapacity) || 2000,
    };
}

async function refreshFinalReportBattleSnapshotIfNeeded({
    battleId,
    battle,
    nowMs,
    refreshBattleSnapshotIfEndTimeChanged,
}) {
    let endsAtMs = getBattleEndsAtMs(battle);
    if (!Number.isFinite(endsAtMs) || Number(nowMs) >= endsAtMs) {
        return { battle, endsAtMs };
    }

    const refreshedSnapshot = await refreshBattleSnapshotIfEndTimeChanged(battleId, battle, { endsAtMs });
    return {
        battle: refreshedSnapshot?.battle || battle,
        endsAtMs: refreshedSnapshot?.endsAtMs,
    };
}

function shouldIgnoreEmptyFinalReport({ hasReportPayload, finalMarker }) {
    return !hasReportPayload && !finalMarker;
}

module.exports = {
    buildFinalReportCapacityClaimInput,
    getFinalReportWindowError,
    isFinalDamageAction,
    refreshFinalReportBattleSnapshotIfNeeded,
    shouldIgnoreEmptyFinalReport,
};
