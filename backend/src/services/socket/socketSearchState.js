const searchSessions = new Map();
const searchPairLocks = new Set();
const chatStartLocks = new Set();

function normalizeSearchUserId(userId) {
    return userId == null ? '' : userId.toString();
}

function getSearchSession(userId) {
    return searchSessions.get(normalizeSearchUserId(userId)) || null;
}

function setSearchSession(session) {
    if (!session?.userId) return null;
    searchSessions.set(normalizeSearchUserId(session.userId), session);
    return session;
}

function updateSearchSession(userId, patch = {}) {
    const current = getSearchSession(userId);
    if (!current) return null;
    const next = { ...current, ...patch };
    searchSessions.set(normalizeSearchUserId(userId), next);
    return next;
}

function clearSearchSession(userId) {
    const userKey = normalizeSearchUserId(userId);
    if (!userKey) return;
    searchSessions.delete(userKey);
}

function getSearchPairLockKey(firstUserId, secondUserId) {
    return [normalizeSearchUserId(firstUserId), normalizeSearchUserId(secondUserId)].sort().join(':');
}

function acquireSearchPairLock(firstUserId, secondUserId) {
    const lockKey = getSearchPairLockKey(firstUserId, secondUserId);
    if (!lockKey || searchPairLocks.has(lockKey)) return null;
    searchPairLocks.add(lockKey);
    return lockKey;
}

function releaseSearchPairLock(lockKey) {
    if (!lockKey) return;
    searchPairLocks.delete(lockKey);
}

function isUserStartingChat(userId) {
    const userKey = normalizeSearchUserId(userId);
    return Boolean(userKey && chatStartLocks.has(userKey));
}

function acquireChatStartLock(userIds = [], { isActiveUser = () => false } = {}) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(normalizeSearchUserId).filter(Boolean))];
    if (ids.length < 2) return null;
    if (ids.some((id) => chatStartLocks.has(id) || isActiveUser(id))) return null;
    ids.forEach((id) => chatStartLocks.add(id));
    return ids;
}

function releaseChatStartLock(lockIds) {
    if (!Array.isArray(lockIds)) return;
    lockIds.forEach((id) => chatStartLocks.delete(normalizeSearchUserId(id)));
}

function resetSearchState() {
    searchSessions.clear();
    searchPairLocks.clear();
    chatStartLocks.clear();
}

module.exports = {
    acquireChatStartLock,
    acquireSearchPairLock,
    clearSearchSession,
    getSearchPairLockKey,
    getSearchSession,
    isUserStartingChat,
    releaseChatStartLock,
    releaseSearchPairLock,
    resetSearchState,
    setSearchSession,
    updateSearchSession,
};
