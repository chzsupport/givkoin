const { normalizeUserId } = require('./socketRooms');

const pendingCallTimeouts = new Map();

function getTimeoutId(timeoutEntry) {
    return timeoutEntry?.timeoutId || timeoutEntry;
}

function setPendingCallTimeout(targetId, timeoutEntry) {
    const targetKey = normalizeUserId(targetId);
    if (!targetKey || !timeoutEntry) return null;
    pendingCallTimeouts.set(targetKey, timeoutEntry);
    return timeoutEntry;
}

function getPendingCallTimeoutRecord(targetId) {
    const targetKey = normalizeUserId(targetId);
    if (!targetKey) return null;
    return pendingCallTimeouts.get(targetKey) || null;
}

function clearPendingCallTimeout(targetId) {
    const targetKey = normalizeUserId(targetId);
    const timeoutEntry = pendingCallTimeouts.get(targetKey);
    const timeoutId = getTimeoutId(timeoutEntry);
    if (timeoutId) {
        clearTimeout(timeoutId);
        pendingCallTimeouts.delete(targetKey);
        return true;
    }
    return false;
}

function clearPendingCallTimeoutsForUser(userId) {
    const userKey = normalizeUserId(userId);
    let cleared = 0;
    for (const [targetId, timeoutEntry] of Array.from(pendingCallTimeouts.entries())) {
        const initiatorId = normalizeUserId(timeoutEntry?.initiatorId);
        const timeoutId = getTimeoutId(timeoutEntry);
        if (targetId === userKey || initiatorId === userKey) {
            clearTimeout(timeoutId);
            pendingCallTimeouts.delete(targetId);
            cleared += 1;
        }
    }
    return cleared;
}

function resetPendingCallTimeouts() {
    let cleared = 0;
    for (const timeoutEntry of pendingCallTimeouts.values()) {
        const timeoutId = getTimeoutId(timeoutEntry);
        if (timeoutId) {
            clearTimeout(timeoutId);
            cleared += 1;
        }
    }
    pendingCallTimeouts.clear();
    return cleared;
}

module.exports = {
    clearPendingCallTimeout,
    clearPendingCallTimeoutsForUser,
    getPendingCallTimeoutRecord,
    resetPendingCallTimeouts,
    setPendingCallTimeout,
};
