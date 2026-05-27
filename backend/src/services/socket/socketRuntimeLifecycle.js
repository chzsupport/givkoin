const matchingService = require('../matchingService');
const {
    getQueuedUser: getSharedQueuedUser,
    addToQueue: addSharedToQueue,
    removeFromQueue: removeSharedFromQueue,
    clearPendingCall: clearSharedPendingCall,
    clearPendingCallsForUser: clearSharedPendingCallsForUser,
    resetRuntimeState: resetSharedRuntimeState,
} = require('../socketRuntimeStateService');
const {
    clearSearchSession: clearStoredSearchSession,
    getSearchSession,
    resetSearchState,
} = require('./socketSearchState');
const { normalizeUserId } = require('./socketRooms');
const {
    clearPendingCallTimeout,
    clearPendingCallTimeoutsForUser,
    resetPendingCallTimeouts,
} = require('./socketPendingCallTimeouts');
const { resetChatTimeouts } = require('./socketChatTimeouts');
const { resetActiveChats } = require('./socketActiveChats');
const { resetActiveChatContexts } = require('./socketChatContextStore');
const { resetOnlineUsers } = require('./socketOnlineUsers');

async function getQueuedUser(userId) {
    return getSharedQueuedUser(normalizeUserId(userId));
}

async function clearPendingCall(targetId) {
    const targetKey = normalizeUserId(targetId);
    clearPendingCallTimeout(targetKey);
    return clearSharedPendingCall(targetKey);
}

async function clearPendingCallsForUser(userId) {
    const userKey = normalizeUserId(userId);
    clearPendingCallTimeoutsForUser(userKey);
    await clearSharedPendingCallsForUser(userKey);
}

function resetRuntimeState() {
    resetSharedRuntimeState();
    resetPendingCallTimeouts();
    resetSearchState();
    resetChatTimeouts();
    resetActiveChats();
    resetActiveChatContexts();
    resetOnlineUsers();
}

function clearSearchSession(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;
    clearStoredSearchSession(userKey);
    matchingService.updateOnlineUser(userKey, {
        isSearching: false,
        searchStartedAt: 0,
    });
}

async function removeFromQueue(userId) {
    const userKey = normalizeUserId(userId);
    clearSearchSession(userKey);
    await removeSharedFromQueue(userKey);
}

async function stopSearchForMatchedUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;

    const isSearching = Boolean(getSearchSession(userKey)) || Boolean(await getQueuedUser(userKey));
    await clearPendingCallsForUser(userKey);

    if (isSearching) {
        await removeFromQueue(userKey);
    }
}

async function addToQueue(userId, socketId) {
    const userKey = normalizeUserId(userId);
    if (!userKey || await getQueuedUser(userKey)) return false;

    return addSharedToQueue({
        userId: userKey,
        socketId,
        startedAt: Date.now()
    });
}

module.exports = {
    addToQueue,
    clearPendingCall,
    clearPendingCallsForUser,
    clearSearchSession,
    getQueuedUser,
    removeFromQueue,
    resetRuntimeState,
    stopSearchForMatchedUser,
};
