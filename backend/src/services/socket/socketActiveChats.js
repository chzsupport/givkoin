const { normalizeUserId } = require('./socketRooms');

const userActiveChat = new Map();

function normalizeChatId(chatId) {
    if (chatId === null || chatId === undefined) return '';
    return String(chatId);
}

function setUserActiveChat(userId, chatId) {
    const userKey = normalizeUserId(userId);
    const chatKey = normalizeChatId(chatId);
    if (!userKey || !chatKey) return null;
    userActiveChat.set(userKey, chatKey);
    return chatKey;
}

function getUserActiveChat(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return null;
    return userActiveChat.get(userKey) || null;
}

function hasUserActiveChat(userId) {
    return Boolean(getUserActiveChat(userId));
}

function deleteUserActiveChat(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return false;
    return userActiveChat.delete(userKey);
}

function clearUsersActiveChat(userIds = []) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    let cleared = 0;
    ids.forEach((userId) => {
        if (deleteUserActiveChat(userId)) cleared += 1;
    });
    return cleared;
}

function resetActiveChats() {
    const cleared = userActiveChat.size;
    userActiveChat.clear();
    return cleared;
}

module.exports = {
    clearUsersActiveChat,
    deleteUserActiveChat,
    getUserActiveChat,
    hasUserActiveChat,
    resetActiveChats,
    setUserActiveChat,
};
