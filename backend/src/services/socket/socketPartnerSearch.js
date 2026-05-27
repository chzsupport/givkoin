const matchingService = require('../matchingService');
const {
    getPendingCallRecord,
    hasOutgoingPendingCall,
    hasPendingCall,
    setPendingCall,
} = require('../socketRuntimeStateService');
const {
    acquireSearchPairLock,
    getSearchSession,
    isUserStartingChat,
    releaseSearchPairLock,
    setSearchSession,
    updateSearchSession,
} = require('./socketSearchState');
const {
    getUserRoomName,
    hasUserRoom,
    normalizeUserId,
} = require('./socketRooms');
const { hasUserActiveChat } = require('./socketActiveChats');
const {
    clearPendingCallTimeout,
    setPendingCallTimeout,
} = require('./socketPendingCallTimeouts');
const {
    addToQueue,
    clearPendingCall,
    clearSearchSession,
    getQueuedUser,
    removeFromQueue,
} = require('./socketRuntimeLifecycle');

const SEARCH_CALL_TIMEOUT_MS = 60000;
const SEARCH_MAX_ROUNDS = 3;

function buildCallToken(initiatorKey, targetId, now = Date.now(), randomValue = Math.random()) {
    const suffix = typeof randomValue === 'string'
        ? randomValue
        : Number(randomValue).toString(16).slice(2);
    return `${initiatorKey}:${targetId}:${now}:${suffix}`;
}

function buildInitialSearchSession(userKey, socketId, startedAt = Date.now()) {
    return {
        userId: userKey,
        socketId,
        round: 0,
        candidateIds: [],
        candidateIndex: 0,
        currentTargetId: null,
        currentCallToken: '',
        startedAt,
    };
}

function buildNextRoundSearchSession(currentSession, nextRound, nextCandidates = []) {
    return {
        ...currentSession,
        round: nextRound,
        candidateIds: nextCandidates.map((candidate) => normalizeUserId(candidate?._id)).filter(Boolean),
        candidateIndex: 0,
    };
}

function isSearchRoundExhausted(session) {
    return !Array.isArray(session?.candidateIds) || session.candidateIndex >= session.candidateIds.length;
}

function clearCurrentCallForInitiator(initiatorId, targetId = null, callToken = null) {
    const userKey = normalizeUserId(initiatorId);
    const session = getSearchSession(userKey);
    if (!session) return null;
    if (targetId && normalizeUserId(session.currentTargetId) !== normalizeUserId(targetId)) return session;
    if (callToken && String(session.currentCallToken || '') !== String(callToken || '')) return session;
    return updateSearchSession(userKey, {
        currentTargetId: null,
        currentCallToken: '',
    });
}

function scheduleCallTimeout(io, targetId, initiatorId, callToken) {
    const targetKey = normalizeUserId(targetId);
    const initiatorKey = normalizeUserId(initiatorId);
    clearPendingCallTimeout(targetKey);
    const timeoutId = setTimeout(() => {
        void (async () => {
            const pendingCall = await getPendingCallRecord(targetKey);
            if (!pendingCall) return;
            if (pendingCall.initiatorId !== initiatorKey) return;
            if (String(pendingCall.token || '') !== String(callToken || '')) return;

            await clearPendingCall(targetKey);
            clearCurrentCallForInitiator(initiatorKey, targetKey, callToken);
            io.to(getUserRoomName(targetKey)).emit('call_timeout');
            io.to(getUserRoomName(initiatorKey)).emit('call_timeout');
            await continueSearch(io, initiatorKey);
        })().catch(() => { });
    }, SEARCH_CALL_TIMEOUT_MS);
    setPendingCallTimeout(targetKey, { timeoutId, initiatorId: initiatorKey, token: String(callToken || '') });
}

async function tryStartMutualSearchCall(io, initiatorId) {
    const initiatorKey = normalizeUserId(initiatorId);
    const initiatorSession = getSearchSession(initiatorKey);
    if (!initiatorSession || initiatorSession.currentTargetId) return false;
    if (isUserStartingChat(initiatorKey) || hasUserActiveChat(initiatorKey)) return false;
    if (await hasPendingCall(initiatorKey) || await hasOutgoingPendingCall(initiatorKey)) return false;

    const directCandidates = await matchingService.findMatchCandidates(initiatorKey, {
        onlySearching: true,
        requireMutual: true,
    });

    for (const candidate of directCandidates) {
        const targetId = normalizeUserId(candidate?._id);
        if (!targetId || targetId === initiatorKey) continue;
        if (isUserStartingChat(targetId) || hasUserActiveChat(targetId)) continue;
        if (await hasPendingCall(targetId) || await hasOutgoingPendingCall(targetId)) continue;

        const targetSession = getSearchSession(targetId);
        if (!targetSession || targetSession.currentTargetId) continue;
        if (!(await getQueuedUser(targetId))) continue;
        if (await hasPendingCall(initiatorKey) || await hasPendingCall(targetId)) continue;

        const lockKey = acquireSearchPairLock(initiatorKey, targetId);
        if (!lockKey) continue;

        try {
            const freshInitiatorSession = getSearchSession(initiatorKey);
            const freshTargetSession = getSearchSession(targetId);
            if (!freshInitiatorSession || !freshTargetSession) continue;
            if (freshInitiatorSession.currentTargetId || freshTargetSession.currentTargetId) continue;

            const initiatorProfile = matchingService.getOnlineProfile(initiatorKey);
            const targetProfile = matchingService.getOnlineProfile(targetId);
            if (!matchingService.areProfilesMutuallyCompatible(initiatorProfile, targetProfile)) continue;

            const callToken = buildCallToken(initiatorKey, targetId);
            const pendingSet = await setPendingCall(targetId, initiatorKey, SEARCH_CALL_TIMEOUT_MS, callToken);
            if (!pendingSet) continue;

            updateSearchSession(initiatorKey, {
                currentTargetId: targetId,
                currentCallToken: callToken,
            });

            io.to(getUserRoomName(targetId)).emit('incoming_call', { callerId: initiatorKey });
            io.to(getUserRoomName(initiatorKey)).emit('calling_partner');
            scheduleCallTimeout(io, targetId, initiatorKey, callToken);
            return true;
        } finally {
            releaseSearchPairLock(lockKey);
        }
    }

    return false;
}

async function continueSearch(io, initiatorId) {
    const initiatorKey = normalizeUserId(initiatorId);
    const session = getSearchSession(initiatorKey);
    if (!session) return false;
    if (isUserStartingChat(initiatorKey)) return true;
    if (hasUserActiveChat(initiatorKey)) return false;
    if (!(await getQueuedUser(initiatorKey))) {
        clearSearchSession(initiatorKey);
        return false;
    }
    if (await hasPendingCall(initiatorKey) || await hasOutgoingPendingCall(initiatorKey)) return true;
    if (session.currentTargetId) return true;

    if (await tryStartMutualSearchCall(io, initiatorKey)) {
        return true;
    }

    while (true) {
        const freshSession = getSearchSession(initiatorKey);
        if (!freshSession) return false;

        if (isSearchRoundExhausted(freshSession)) {
            const nextRound = Number(freshSession.round || 0) + 1;
            if (nextRound > SEARCH_MAX_ROUNDS) {
                const currentSession = getSearchSession(initiatorKey);
                if (!currentSession || hasUserActiveChat(initiatorKey) || !(await getQueuedUser(initiatorKey))) {
                    return false;
                }
                await removeFromQueue(initiatorKey);
                io.to(getUserRoomName(initiatorKey)).emit('no_partner');
                return false;
            }

            const nextCandidates = await matchingService.findMatchCandidates(initiatorKey);
            if (!nextCandidates.length) {
                const currentSession = getSearchSession(initiatorKey);
                if (!currentSession || hasUserActiveChat(initiatorKey) || !(await getQueuedUser(initiatorKey))) {
                    return false;
                }
                await removeFromQueue(initiatorKey);
                io.to(getUserRoomName(initiatorKey)).emit('no_partner');
                return false;
            }

            setSearchSession(buildNextRoundSearchSession(freshSession, nextRound, nextCandidates));

            if (await tryStartMutualSearchCall(io, initiatorKey)) {
                return true;
            }
            continue;
        }

        const targetId = normalizeUserId(freshSession.candidateIds[freshSession.candidateIndex]);
        updateSearchSession(initiatorKey, {
            candidateIndex: freshSession.candidateIndex + 1,
        });

        if (hasUserActiveChat(initiatorKey)) return false;
        if (!targetId || targetId === initiatorKey) continue;
        if (isUserStartingChat(targetId) || hasUserActiveChat(targetId)) continue;
        if (!(await hasUserRoom(io, targetId))) continue;
        if (await hasPendingCall(initiatorKey) || await hasOutgoingPendingCall(initiatorKey)) continue;
        if (await hasPendingCall(targetId) || await hasOutgoingPendingCall(targetId)) continue;

        const targetProfile = matchingService.getOnlineProfile(targetId);
        if (!targetProfile || targetProfile.chatStatus !== 'available') continue;

        if (targetProfile.isSearching) {
            if (await tryStartMutualSearchCall(io, initiatorKey)) {
                return true;
            }
            continue;
        }

        const callToken = buildCallToken(initiatorKey, targetId);
        const pendingSet = await setPendingCall(targetId, initiatorKey, SEARCH_CALL_TIMEOUT_MS, callToken);
        if (!pendingSet) continue;

        updateSearchSession(initiatorKey, {
            currentTargetId: targetId,
            currentCallToken: callToken,
        });

        io.to(getUserRoomName(targetId)).emit('incoming_call', { callerId: initiatorKey });
        io.to(getUserRoomName(initiatorKey)).emit('calling_partner');
        scheduleCallTimeout(io, targetId, initiatorKey, callToken);
        return true;
    }
}

async function startPartnerSearch(io, userId, socketId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return false;

    if (getSearchSession(userKey)) {
        return true;
    }
    if (await hasPendingCall(userKey) || await hasOutgoingPendingCall(userKey)) {
        return true;
    }

    const added = await addToQueue(userKey, socketId);
    if (!added && !(await getQueuedUser(userKey))) {
        return false;
    }

    const startedAt = Date.now();
    setSearchSession(buildInitialSearchSession(userKey, socketId, startedAt));
    matchingService.updateOnlineUser(userKey, {
        isSearching: true,
        searchStartedAt: startedAt,
        chatStatus: 'available',
    });

    io.to(getUserRoomName(userKey)).emit('searching');
    return continueSearch(io, userKey);
}

module.exports = {
    buildCallToken,
    buildInitialSearchSession,
    buildNextRoundSearchSession,
    clearCurrentCallForInitiator,
    continueSearch,
    isSearchRoundExhausted,
    scheduleCallTimeout,
    startPartnerSearch,
    tryStartMutualSearchCall,
};
