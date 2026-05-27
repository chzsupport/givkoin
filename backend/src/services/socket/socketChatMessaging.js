const chatService = require('../chatService');
const { getChatById } = require('./socketDataStore');
const { getActiveChatContext } = require('./socketChatContextStore');
const {
    getChatPreparationState,
    primeActiveChatContext,
} = require('./socketChatLifecycle');

const CHAT_ROOM_PREFIX = 'chat-';
const CHAT_IDLE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

function isChatParticipant(chatContext, userId) {
    return Boolean(
        chatContext
        && Array.isArray(chatContext.participants)
        && chatContext.participants.includes(String(userId))
    );
}

function buildChatPreparingPayload(chatId, preparation) {
    return {
        chatId: String(chatId),
        countdownSeconds: preparation.countdownSeconds,
        readyAt: preparation.readyAt,
    };
}

function getMessageLanguagePair(chatContext, currentUserId) {
    const participantLanguages = chatContext?.participantLanguages || {};
    const partnerId = (chatContext?.participants || []).find((participantId) => String(participantId) !== String(currentUserId));
    return {
        partnerId,
        sourceLang: participantLanguages[String(currentUserId)] || 'ru',
        targetLang: participantLanguages[String(partnerId)] || 'ru',
    };
}

function buildNewMessagePayload(message, currentUserId) {
    return {
        _id: message._id,
        senderId: currentUserId,
        originalText: message.originalText,
        translatedText: message.translatedText,
        createdAt: message.createdAt,
    };
}

async function resolveActiveChatContext(chatId, currentUserId) {
    let chatContext = getActiveChatContext(String(chatId));
    let chat = null;

    if (!isChatParticipant(chatContext, currentUserId)) {
        chat = await getChatById(chatId);
        if (!chat || chat.status !== 'active') return null;
        if (chat.waitingState?.isWaiting) return null;
        chatContext = await primeActiveChatContext(chat);
    }

    if (!isChatParticipant(chatContext, currentUserId)) {
        return null;
    }

    return chatContext;
}

async function handleSendMessage(io, socket, currentUserId, { chatId, text } = {}) {
    const chatContext = await resolveActiveChatContext(chatId, currentUserId);
    if (!chatContext) return;

    const preparation = getChatPreparationState(chatContext);
    if (preparation.isPreparing) {
        socket.emit('chat_preparing', buildChatPreparingPayload(chatId, preparation));
        return;
    }

    const { sourceLang, targetLang } = getMessageLanguagePair(chatContext, currentUserId);

    const message = await chatService.createMessage({
        chatId,
        senderId: currentUserId,
        content: text,
        language: sourceLang,
        targetLanguage: targetLang,
        chatContext,
    });

    io.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('new_message', buildNewMessagePayload(message, currentUserId));
}

function handleTyping(socket, chatId, eventName) {
    const chatContext = getActiveChatContext(String(chatId));
    if (getChatPreparationState(chatContext).isPreparing) return;
    socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit(eventName);
}

async function handleChatHeartbeat(currentUserId, { chatId } = {}) {
    const chatContext = getActiveChatContext(String(chatId));
    if (!isChatParticipant(chatContext, currentUserId)) return;
    if (getChatPreparationState(chatContext).isPreparing) return;
    await chatService.touchChatActivity(chatId, {
        lastHeartbeatUserId: String(currentUserId),
        heartbeatIntervalMs: CHAT_IDLE_HEARTBEAT_INTERVAL_MS,
    });
}

module.exports = {
    buildChatPreparingPayload,
    buildNewMessagePayload,
    getMessageLanguagePair,
    handleChatHeartbeat,
    handleSendMessage,
    handleTyping,
    isChatParticipant,
};
