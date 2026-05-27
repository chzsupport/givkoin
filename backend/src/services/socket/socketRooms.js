function normalizeUserId(userId) {
    return userId == null ? '' : userId.toString();
}

function getUserRoomName(userId) {
    return `user-${normalizeUserId(userId)}`;
}

async function hasUserRoom(io, userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey || !io) return false;

    try {
        if (typeof io.in === 'function') {
            const sockets = await io.in(getUserRoomName(userKey)).allSockets();
            return sockets.size > 0;
        }
    } catch (_error) {
        // Fallback to local adapter state below.
    }

    const room = io?.sockets?.adapter?.rooms?.get(getUserRoomName(userKey));
    return Boolean(room && room.size > 0);
}

function countUserRooms(io) {
    const rooms = io?.sockets?.adapter?.rooms;
    if (!rooms) return null;

    let count = 0;
    for (const [roomName, room] of rooms.entries()) {
        if (typeof roomName === 'string' && roomName.startsWith('user-') && room?.size > 0) {
            count += 1;
        }
    }
    return count;
}

module.exports = {
    countUserRooms,
    getUserRoomName,
    hasUserRoom,
    normalizeUserId,
};
