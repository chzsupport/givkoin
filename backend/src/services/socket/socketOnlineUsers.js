const { countUserRooms, normalizeUserId } = require('./socketRooms');

const onlineUsers = new Set();

function addOnlineUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return false;
    onlineUsers.add(userKey);
    return true;
}

function removeOnlineUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return false;
    return onlineUsers.delete(userKey);
}

function isUserOnline(userId) {
    const userKey = normalizeUserId(userId);
    return Boolean(userKey && onlineUsers.has(userKey));
}

function getOnlineUserIds() {
    return Array.from(onlineUsers);
}

function getOnlineUserCount(io) {
    // If io is provided, prefer room-based check (source of truth)
    const roomCount = countUserRooms(io);
    if (roomCount !== null) return roomCount;
    return onlineUsers.size;
}

function resetOnlineUsers() {
    onlineUsers.clear();
}

module.exports = {
    addOnlineUser,
    getOnlineUserCount,
    getOnlineUserIds,
    isUserOnline,
    removeOnlineUser,
    resetOnlineUsers,
};
