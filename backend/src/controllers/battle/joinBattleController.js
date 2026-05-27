const {
    clearCurrentBattlePersonalCache,
    primeCurrentBattleSharedCache,
    resolveJoinBattleCandidate: defaultResolveJoinBattleCandidate,
    setCachedCurrentBattlePersonal,
} = require('./currentBattleCache');
const {
    releaseBattleJoinSlot: defaultReleaseBattleJoinSlot,
    reserveBattleJoinSlot: defaultReserveBattleJoinSlot,
} = require('./joinQueue');
const {
    buildBattleJoinQueuedResponsePayload,
    buildBattleJoinResponsePayload,
    buildBattleJoinTimingPayload,
    buildBattlePersonalStatePayload,
    getBattleJoinSharedPayload,
    parseBattleJoinedAt,
} = require('./responsePayload');
const {
    bindPendingBattleBoosts,
    buildBattleResourceSnapshot,
    buildUserRowFromRequestUser,
    getUserData,
    getUserRowById,
} = require('./userData');
const {
    getRequestLang,
    sendLocalizedError,
    sendServerError,
} = require('./localizedResponse');
const {
    getActiveJoinBattleId,
    isBattleAlreadyEndedForJoin,
    normalizeRequestedBattleId,
} = require('./joinBattleState');

function createJoinBattleHandler({
    getCachedBattleDocById,
    ensureBattleAttendanceReady,
    setHeartbeatBattleSnapshot,
    clearSummaryBattleSnapshot,
    heartbeatBattleCacheTtlMs = 5000,
    resolveJoinBattleCandidate = defaultResolveJoinBattleCandidate,
    reserveBattleJoinSlot = defaultReserveBattleJoinSlot,
    releaseBattleJoinSlot = defaultReleaseBattleJoinSlot,
} = {}) {
    return async function joinBattle(req, res) {
        let activeBattleId = null;
        try {
            const userLang = getRequestLang(req);
            const requestedBattleId = normalizeRequestedBattleId(req.body?.battleId);
            const battle = await resolveJoinBattleCandidate({
                requestedBattleId,
                getCachedBattleDocById,
                requestedTtlMs: heartbeatBattleCacheTtlMs,
            });
            if (!battle) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Нет активного боя', en: 'No active battle' });
            }
            activeBattleId = getActiveJoinBattleId(battle);
            if (isBattleAlreadyEndedForJoin({ battle })) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Бой уже закончился', en: 'Battle has already ended' });
            }

            const joinSlot = reserveBattleJoinSlot({
                battleId: battle._id,
                userId: req.user._id,
            });
            if (joinSlot.queued) {
                return res.status(202).json(buildBattleJoinQueuedResponsePayload({ joinSlot, battle }));
            }

            const userRow = buildUserRowFromRequestUser(req.user) || await getUserRowById(req.user._id);
            if (!userRow) {
                releaseBattleJoinSlot({ battleId: battle._id, userId: req.user._id });
                return sendLocalizedError(res, { status: 404, lang: userLang, ru: 'Пользователь не найден', en: 'User not found' });
            }
            const userData = getUserData(userRow);
            const safeJoinedAt = parseBattleJoinedAt(req.body?.joinedAt);
            const attendanceReady = await ensureBattleAttendanceReady({
                battleId: battle._id,
                userId: req.user._id,
                battle,
                shouldEnsureFirstJoin: !battle.firstPlayerJoinedAt,
                joinedAt: safeJoinedAt,
                resourceSnapshot: buildBattleResourceSnapshot(userData),
            });

            const updatedBattle = attendanceReady.battleSnapshot || battle;
            const responseNowMs = Date.now();
            const { battleStartsAtMs, timeLeftMs } = buildBattleJoinTimingPayload({
                battle: updatedBattle,
                nowMs: responseNowMs,
            });
            const sharedPayload = getBattleJoinSharedPayload(updatedBattle);
            await bindPendingBattleBoosts(req.user._id, updatedBattle._id, new Date(), { userRow });
            setHeartbeatBattleSnapshot(updatedBattle._id, updatedBattle);
            clearSummaryBattleSnapshot(updatedBattle._id);
            primeCurrentBattleSharedCache({ battle: updatedBattle });
            clearCurrentBattlePersonalCache({ battleId: updatedBattle._id });
            releaseBattleJoinSlot({ battleId: updatedBattle._id, userId: req.user._id });
            const personalState = buildBattlePersonalStatePayload(attendanceReady?.entry || null, userData);
            setCachedCurrentBattlePersonal({
                battleId: updatedBattle._id,
                userId: req.user._id,
                attendanceEntry: attendanceReady?.entry || null,
                personalState,
            });

            return res.json(buildBattleJoinResponsePayload({
                battle: updatedBattle,
                attendanceEntry: attendanceReady?.entry || null,
                personalState,
                joinedAt: safeJoinedAt,
                serverNowMs: responseNowMs,
                battleStartsAtMs,
                timeLeftMs,
                sharedPayload,
            }));
        } catch (error) {
            if (activeBattleId) {
                releaseBattleJoinSlot({ battleId: activeBattleId, userId: req.user?._id });
            }
            console.error('Join battle error:', error);
            return sendServerError(res, req);
        }
    };
}

module.exports = {
    createJoinBattleHandler,
};
