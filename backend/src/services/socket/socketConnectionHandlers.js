const matchingService = require('../matchingService');
const { normalizeRequestLanguage } = require('../../utils/requestLanguage');

const {
    findActiveChatByParticipant,
    getChatById,
    getUserRowById,
} = require('./socketDataStore');
const {
    buildSocketMessage,
    buildSocketMessageKey,
} = require('./socketMessages');
const { getActiveChatDurationSeconds } = require('./socketTiming');
const {
    getUserRoomName,
    hasUserRoom,
    normalizeUserId,
} = require('./socketRooms');
const { getChatPreparationState } = require('./socketChatContextStore');
const {
    addOnlineUser,
    removeOnlineUser,
} = require('./socketOnlineUsers');
const {
    deleteUserActiveChat,
    getUserActiveChat,
    setUserActiveChat,
} = require('./socketActiveChats');
const {
    setUsersChatStatus,
    touchUserTimestamp,
} = require('./socketUserStatus');
const { primeActiveChatContext } = require('./socketChatLifecycle');
const {
    clearPendingCallsForUser,
    removeFromQueue,
} = require('./socketRuntimeLifecycle');
const {
    handlePartnerReconnected,
    startWaitingForReconnect,
} = require('./socketChatSessionLifecycle');

const CHAT_ROOM_PREFIX = 'chat-';
const MAX_DISCONNECTS_PER_CHAT = 3;

function buildChatRoomName(chatId) {
    return `${CHAT_ROOM_PREFIX}${chatId}`;
}

function setSocketSiteLanguage(socket, language) {
    const normalized = normalizeRequestLanguage(language || socket.data.siteLanguage);
    socket.data.siteLanguage = normalized;
    return normalized;
}

function isChatParticipant(chat, userId) {
    return (chat?.participants || []).map(String).includes(String(userId));
}

function getChatPartnerId(chat, currentUserId) {
    return (chat?.participants || []).find((participantId) => participantId.toString() !== currentUserId);
}

function buildChatPreparingPayload(chatId, preparation) {
    return {
        chatId: String(chatId),
        countdownSeconds: preparation.countdownSeconds,
        readyAt: preparation.readyAt,
    };
}

function getWaitingDisconnectState(chat, { nowMs = Date.now() } = {}) {
    const waitingState = chat?.waitingState || {};
    const disconnectedId = waitingState?.disconnectedUserId ? String(waitingState.disconnectedUserId) : '';
    const waitingSinceMs = new Date(waitingState.waitingSince).getTime();
    const elapsed = Math.floor((nowMs - waitingSinceMs) / 1000);
    const timeLeft = Math.max(0, 60 - elapsed);
    const activeElapsedSeconds = Math.max(0, Math.floor(
        Number(waitingState?.activeElapsedSeconds)
        || getActiveChatDurationSeconds(chat, { endedAt: new Date(waitingSinceMs) })
    ));
    const disconnectionCount = chat?.disconnectionCount && typeof chat.disconnectionCount === 'object'
        ? chat.disconnectionCount
        : {};
    const disconnectCount = disconnectedId ? (Number(disconnectionCount[disconnectedId]) || 0) : 0;
    const isSoft = waitingState?.mode === 'soft';

    return {
        key: isSoft ? 'chat.partner_connection_lost_soft' : 'chat.partner_connection_lost_wait',
        payload: {
            chatId: chat._id,
            disconnectCount,
            maxDisconnects: isSoft ? 0 : MAX_DISCONNECTS_PER_CHAT,
            timeLeft: isSoft ? 0 : timeLeft,
            activeElapsedSeconds,
            strictMode: !isSoft,
        },
        disconnectedId,
    };
}

async function handleSocketAuth(io, socket, payload = {}, { setCurrentUserId } = {}) {
    try {
        setSocketSiteLanguage(socket, payload?.siteLanguage || socket.data.siteLanguage);
        const userId = socket.data.userId || null;
        if (!userId) {
            socket.emit('auth:error', buildSocketMessage(socket, 'auth.authorization_required', 'Требуется авторизация', 'Authorization required'));
            socket.disconnect();
            return null;
        }
        const userKey = normalizeUserId(userId);
        const hadLiveSocketBeforeJoin = await hasUserRoom(io, userKey);
        if (typeof setCurrentUserId === 'function') {
            setCurrentUserId(userKey);
        }
        await socket.join(getUserRoomName(userKey));
        addOnlineUser(userKey);

        const currentUserRow = await getUserRowById(userKey);
        if (currentUserRow) {
            matchingService.registerOnlineUser(userKey, currentUserRow);
        }

        if (!hadLiveSocketBeforeJoin) {
            await touchUserTimestamp(userKey, 'lastOnlineAt');
        }

        const activeChat = await findActiveChatByParticipant(userKey);

        if (!activeChat) {
            deleteUserActiveChat(userKey);
            await setUsersChatStatus(userKey, 'available');
            return userKey;
        }

        setUserActiveChat(userKey, activeChat._id);
        await setUsersChatStatus(userKey, 'in_chat');
        await primeActiveChatContext(activeChat);

        if (activeChat.waitingState?.isWaiting) {
            const { key, payload: waitingPayload, disconnectedId } = getWaitingDisconnectState(activeChat);
            if (disconnectedId === userKey) {
                await handlePartnerReconnected(io, activeChat._id, userKey);
            } else {
                io.to(getUserRoomName(userKey)).emit('partner_disconnected', buildSocketMessageKey(key, waitingPayload));
            }
        }

        return userKey;
    } catch (error) {
        console.error('Error in auth handler:', error);
        return null;
    }
}

async function handleSocketDisconnect(io, currentUserId) {
    if (!currentUserId) return;

    try {
        if (await hasUserRoom(io, currentUserId)) {
            return;
        }

        removeOnlineUser(currentUserId);
        matchingService.unregisterOnlineUser(currentUserId);
        await touchUserTimestamp(currentUserId, 'lastSeenAt');

        await removeFromQueue(currentUserId);
        await clearPendingCallsForUser(currentUserId);

        const activeChatId = getUserActiveChat(currentUserId);
        const chat = activeChatId
            ? await getChatById(activeChatId)
            : await findActiveChatByParticipant(currentUserId);

        if (!chat || chat.status !== 'active') {
            deleteUserActiveChat(currentUserId);
            return;
        }

        setUserActiveChat(currentUserId, chat._id);

        if (chat.waitingState?.isWaiting) return;

        const partnerId = getChatPartnerId(chat, currentUserId);
        if (partnerId) {
            await startWaitingForReconnect(io, chat._id, currentUserId, partnerId);
        }
    } catch (error) {
        console.error('Error on disconnect handler:', error);
    }
}

async function handleChatJoin(io, socket, currentUserId, { chatId } = {}) {
    const authenticatedUserId = currentUserId || socket.data.userId || null;
    if (!chatId || !authenticatedUserId) return;

    try {
        const chat = await getChatById(chatId);
        if (!chat) {
            socket.emit('chat_ended', { reason: 'not_found' });
            return;
        }
        if (!isChatParticipant(chat, authenticatedUserId)) {
            socket.emit('chat_ended', { reason: 'not_found' });
            return;
        }
        if (chat.status !== 'active') {
            socket.emit('chat_ended', { reason: chat.status });
            return;
        }

        socket.join(buildChatRoomName(chatId));
        const chatContext = await primeActiveChatContext(chat);
        const preparation = getChatPreparationState(chatContext || chat);
        if (preparation.isPreparing) {
            socket.emit('chat_preparing', buildChatPreparingPayload(chatId, preparation));
        }
        if (chat.waitingState?.isWaiting) {
            const { key, payload } = getWaitingDisconnectState(chat);
            socket.emit('partner_disconnected', buildSocketMessage(
                socket,
                key,
                'У вашего собеседника пропала связь. Подождите его возвращения...',
                'Your chat partner lost connection. Please wait for them to return...',
                payload
            ));
        }
    } catch (error) {
        console.error('Error in chat:join:', error);
    }
}

module.exports = {
    buildChatPreparingPayload,
    buildChatRoomName,
    getChatPartnerId,
    getWaitingDisconnectState,
    handleChatJoin,
    handleSocketAuth,
    handleSocketDisconnect,
    isChatParticipant,
    setSocketSiteLanguage,
};
