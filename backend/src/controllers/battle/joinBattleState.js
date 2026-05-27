const { getBattleEndsAtMs } = require('./summaryPayload');

function normalizeRequestedBattleId(value) {
    return String(value || '').trim();
}

function getActiveJoinBattleId(battle) {
    const battleId = String(battle?._id || '').trim();
    return battleId || null;
}

function isBattleAlreadyEndedForJoin({ battle, nowMs = Date.now() }) {
    const endsAtMs = getBattleEndsAtMs(battle);
    return Number.isFinite(endsAtMs) && Number(nowMs) >= endsAtMs;
}

module.exports = {
    getActiveJoinBattleId,
    isBattleAlreadyEndedForJoin,
    normalizeRequestedBattleId,
};
