const chatWaitingTimeouts = new Map();
const chatPreparationTimeouts = new Map();

function normalizeChatId(chatId) {
    if (chatId === null || chatId === undefined) return '';
    return String(chatId);
}

function setChatWaitingTimeout(chatId, timeoutId) {
    const chatKey = normalizeChatId(chatId);
    if (!chatKey || !timeoutId) return null;
    chatWaitingTimeouts.set(chatKey, timeoutId);
    return timeoutId;
}

function getChatWaitingTimeout(chatId) {
    const chatKey = normalizeChatId(chatId);
    if (!chatKey) return null;
    return chatWaitingTimeouts.get(chatKey) || null;
}

function clearChatWaitingTimeout(chatId) {
    const chatKey = normalizeChatId(chatId);
    const timeoutId = chatWaitingTimeouts.get(chatKey);
    if (!timeoutId) return false;
    clearTimeout(timeoutId);
    chatWaitingTimeouts.delete(chatKey);
    return true;
}

function setChatPreparationTimeout(chatId, timeoutId) {
    const chatKey = normalizeChatId(chatId);
    if (!chatKey || !timeoutId) return null;
    chatPreparationTimeouts.set(chatKey, timeoutId);
    return timeoutId;
}

function getChatPreparationTimeout(chatId) {
    const chatKey = normalizeChatId(chatId);
    if (!chatKey) return null;
    return chatPreparationTimeouts.get(chatKey) || null;
}

function deleteChatPreparationTimeout(chatId) {
    const chatKey = normalizeChatId(chatId);
    if (!chatKey || !chatPreparationTimeouts.has(chatKey)) return false;
    chatPreparationTimeouts.delete(chatKey);
    return true;
}

function clearChatPreparationTimeout(chatId) {
    const chatKey = normalizeChatId(chatId);
    const timeoutId = chatPreparationTimeouts.get(chatKey);
    if (!timeoutId) return false;
    clearTimeout(timeoutId);
    chatPreparationTimeouts.delete(chatKey);
    return true;
}

function resetChatTimeouts() {
    let cleared = 0;
    for (const timeoutId of chatWaitingTimeouts.values()) {
        clearTimeout(timeoutId);
        cleared += 1;
    }
    chatWaitingTimeouts.clear();

    for (const timeoutId of chatPreparationTimeouts.values()) {
        clearTimeout(timeoutId);
        cleared += 1;
    }
    chatPreparationTimeouts.clear();

    return cleared;
}

module.exports = {
    clearChatPreparationTimeout,
    clearChatWaitingTimeout,
    deleteChatPreparationTimeout,
    getChatPreparationTimeout,
    getChatWaitingTimeout,
    resetChatTimeouts,
    setChatPreparationTimeout,
    setChatWaitingTimeout,
};
