const matchingService = require('../matchingService');
const { getPendingCall } = require('../socketRuntimeStateService');
const { getSearchSession } = require('./socketSearchState');
const {
    clearPendingCall,
    clearPendingCallsForUser,
    removeFromQueue,
} = require('./socketRuntimeLifecycle');
const {
    clearCurrentCallForInitiator,
    continueSearch,
} = require('./socketPartnerSearch');

function isExpectedCallResponse(initiatorId, callerId) {
    return initiatorId === callerId;
}

function getUserRoomNameForCall(userId) {
    return `user-${userId}`;
}

function buildDeclinedCallPlan(currentUserId, initiatorId, hasDeclinerSearchSession) {
    return {
        cooldownUserId: currentUserId,
        cooldownSeconds: 30,
        declinedRoom: getUserRoomNameForCall(initiatorId),
        continueSearchUserIds: hasDeclinerSearchSession
            ? [initiatorId, currentUserId]
            : [initiatorId],
    };
}

async function handleAcceptedCall(io, initiatorId, currentUserId, { startChatWithLock }) {
    const started = await startChatWithLock(io, initiatorId, currentUserId);
    if (!started) {
        await continueSearch(io, initiatorId);
    }
}

async function handleDeclinedCall(io, currentUserId, initiatorId) {
    const plan = buildDeclinedCallPlan(currentUserId, initiatorId, Boolean(getSearchSession(currentUserId)));
    matchingService.setCooldown(plan.cooldownUserId, plan.cooldownSeconds);
    io.to(plan.declinedRoom).emit('call_declined');
    for (const userId of plan.continueSearchUserIds) {
        await continueSearch(io, userId);
    }
}

async function handleCallResponse(io, currentUserId, { accepted, callerId } = {}, { startChatWithLock } = {}) {
    if (!currentUserId) return;

    const initiatorId = await getPendingCall(currentUserId);
    if (!isExpectedCallResponse(initiatorId, callerId)) {
        return;
    }

    await clearPendingCall(currentUserId);
    clearCurrentCallForInitiator(initiatorId, currentUserId);

    if (accepted) {
        await handleAcceptedCall(io, initiatorId, currentUserId, { startChatWithLock });
        return;
    }

    await handleDeclinedCall(io, currentUserId, initiatorId);
}

async function handleCancelSearch(currentUserId) {
    await removeFromQueue(currentUserId);
    await clearPendingCallsForUser(currentUserId);
}

module.exports = {
    buildDeclinedCallPlan,
    getUserRoomNameForCall,
    handleCallResponse,
    handleCancelSearch,
    isExpectedCallResponse,
};
