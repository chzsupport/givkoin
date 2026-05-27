const matchingService = require('../matchingService');
const {
    getUserData,
    getUserRowById,
    updateUserDataById,
} = require('./socketDataStore');
const { normalizeUserId } = require('./socketRooms');

function normalizeStatusUserIds(userIds) {
    return [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(normalizeUserId).filter(Boolean))];
}

function buildOnlineStatusPatch(status) {
    return {
        chatStatus: status,
        isSearching: status === 'in_chat' ? false : undefined,
        searchStartedAt: status === 'in_chat' ? 0 : undefined,
    };
}

function buildTimestampPatch(field, now = new Date()) {
    if (!field) return null;
    const date = now instanceof Date ? now : new Date(now || Date.now());
    return { [field]: date.toISOString() };
}

async function setUsersChatStatus(userIds, status) {
    const ids = normalizeStatusUserIds(userIds);
    if (!ids.length || !status) return;

    await Promise.all(
        ids.map(async (id) => {
            const row = await getUserRowById(id);
            if (!row) return;
            const data = getUserData(row);
            matchingService.updateOnlineUser(id, buildOnlineStatusPatch(status));
            if (data.chatStatus === status) return;
            await updateUserDataById(id, { chatStatus: status });
        })
    );
}

async function touchUserTimestamp(userId, field) {
    const userKey = normalizeUserId(userId);
    if (!userKey || !field) return;
    await updateUserDataById(userKey, buildTimestampPatch(field));
}

module.exports = {
    buildOnlineStatusPatch,
    buildTimestampPatch,
    normalizeStatusUserIds,
    setUsersChatStatus,
    touchUserTimestamp,
};
