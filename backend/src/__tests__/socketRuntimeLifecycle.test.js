const test = require('node:test');
const assert = require('node:assert/strict');

const matchingService = require('../services/matchingService');
const {
    getPendingCall,
    hasOutgoingPendingCall,
    setPendingCall,
} = require('../services/socketRuntimeStateService');
const {
    getSearchSession,
    setSearchSession,
} = require('../services/socket/socketSearchState');
const {
    getActiveChatContext,
    setActiveChatContext,
} = require('../services/socket/socketChatContextStore');
const {
    getUserActiveChat,
    setUserActiveChat,
} = require('../services/socket/socketActiveChats');
const {
    addOnlineUser,
    isUserOnline,
} = require('../services/socket/socketOnlineUsers');
const {
    addToQueue,
    clearPendingCall,
    clearPendingCallsForUser,
    clearSearchSession,
    getQueuedUser,
    removeFromQueue,
    resetRuntimeState,
    stopSearchForMatchedUser,
} = require('../services/socket/socketRuntimeLifecycle');

test('socket runtime lifecycle queues a normalized user only once', async () => {
    resetRuntimeState();

    assert.equal(await addToQueue(42, 'socket-1'), true);
    assert.equal(await addToQueue('42', 'socket-2'), false);

    const queued = await getQueuedUser(42);
    assert.equal(queued.userId, '42');
    assert.equal(queued.socketId, 'socket-1');

    await removeFromQueue(42);
    assert.equal(await getQueuedUser('42'), null);
});

test('socket runtime lifecycle clears pending calls by target or user', async () => {
    resetRuntimeState();

    assert.equal(await setPendingCall('target', 'initiator', 60000, 'call-1'), true);
    assert.equal(await getPendingCall('target'), 'initiator');
    assert.equal(await clearPendingCall('target'), 'initiator');
    assert.equal(await getPendingCall('target'), null);

    assert.equal(await setPendingCall('target-2', 'initiator-2', 60000, 'call-2'), true);
    assert.equal(await hasOutgoingPendingCall('initiator-2'), true);
    await clearPendingCallsForUser('initiator-2');
    assert.equal(await getPendingCall('target-2'), null);
    assert.equal(await hasOutgoingPendingCall('initiator-2'), false);
});

test('socket runtime lifecycle clears search session and online search flags', () => {
    resetRuntimeState();
    matchingService.registerOnlineUser('u-clean', {});
    matchingService.updateOnlineUser('u-clean', { isSearching: true, searchStartedAt: 123 });
    setSearchSession({ userId: 'u-clean', round: 1 });

    clearSearchSession('u-clean');

    const profile = matchingService.getOnlineProfile('u-clean');
    assert.equal(getSearchSession('u-clean'), null);
    assert.equal(profile.isSearching, false);
    assert.equal(profile.searchStartedAt, 0);

    matchingService.unregisterOnlineUser('u-clean');
});

test('socket runtime lifecycle stops matched user search state', async () => {
    resetRuntimeState();
    setSearchSession({ userId: 'u-stop', round: 1 });
    assert.equal(await addToQueue('u-stop', 'socket-stop'), true);
    assert.equal(await setPendingCall('target-stop', 'u-stop', 60000, 'call-stop'), true);

    await stopSearchForMatchedUser('u-stop');

    assert.equal(getSearchSession('u-stop'), null);
    assert.equal(await getQueuedUser('u-stop'), null);
    assert.equal(await getPendingCall('target-stop'), null);
});

test('socket runtime lifecycle reset clears shared socket runtime stores', async () => {
    resetRuntimeState();
    await addToQueue('u-reset', 'socket-reset');
    setSearchSession({ userId: 'u-reset', round: 1 });
    setUserActiveChat('u-reset', 'chat-reset');
    setActiveChatContext('chat-reset', { participants: ['u-reset'] });
    addOnlineUser('u-reset');

    resetRuntimeState();

    assert.equal(await getQueuedUser('u-reset'), null);
    assert.equal(getSearchSession('u-reset'), null);
    assert.equal(getUserActiveChat('u-reset'), null);
    assert.equal(getActiveChatContext('chat-reset'), null);
    assert.equal(isUserOnline('u-reset'), false);
});
