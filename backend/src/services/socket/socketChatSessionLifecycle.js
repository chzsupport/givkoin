const chatService = require('../chatService');
const { applyChatCompletionEffects } = require('../chatCompletionService');
const {
    getChatById,
    updateChatById,
} = require('./socketDataStore');
const { buildSocketMessageKey } = require('./socketMessages');
const {
    getActiveChatDurationSeconds,
    getAdjustedStartedAtAfterWaiting,
    getChatIdleDeadline,
    getCompletedChatDurationSeconds,
} = require('./socketTiming');
const { getUserRoomName } = require('./socketRooms');
const {
    getChatFriendSnapshot,
    primeActiveChatContext,
    runDeferredChatFinalization,
    finalizeChatTranscript,
} = require('./socketChatLifecycle');
const { clearActiveChatContext } = require('./socketChatContextStore');
const {
    clearChatPreparationTimeout,
    clearChatWaitingTimeout,
    setChatWaitingTimeout,
} = require('./socketChatTimeouts');
const { clearUsersActiveChat } = require('./socketActiveChats');
const { setUsersChatStatus } = require('./socketUserStatus');
const { registerStrictDisconnectWarning } = require('./socketStrictDisconnectWarning');

const CHAT_ROOM_PREFIX = 'chat-';
const WAITING_TIMEOUT_MS = 60000;
const MAX_DISCONNECTS_PER_CHAT = 3;
const CHAT_STRICT_PHASE_MS = 5 * 60 * 1000;

function buildDisconnectEndedPayload({
    reason,
    duration,
    waitingUserId,
    disconnectedUserId,
    warning = {},
}) {
    return {
        reason,
        duration,
        waitingUserId: waitingUserId ? String(waitingUserId) : '',
        disconnectedUserId: disconnectedUserId ? String(disconnectedUserId) : '',
        lifeDeducted: Boolean(warning.lifeDeducted),
        warningCount30Days: Number(warning.warningCount30Days || 0),
    };
}

function buildWaitingState({ disconnectedUserId, waitingSince, activeElapsedSeconds }) {
    return {
        isWaiting: true,
        mode: 'strict',
        disconnectedUserId,
        waitingSince,
        activeElapsedSeconds,
    };
}

function buildNextDisconnectionCount(currentDisconnectionCount, disconnectedKey) {
    const disconnectionCount = currentDisconnectionCount && typeof currentDisconnectionCount === 'object'
        ? currentDisconnectionCount
        : {};
    const disconnectCount = Number(disconnectionCount[disconnectedKey]) || 0;
    const newDisconnectCount = disconnectCount + 1;
    disconnectionCount[disconnectedKey] = newDisconnectCount;
    return { disconnectionCount, newDisconnectCount };
}

function normalizeFinalizationParticipants(chat) {
    return Array.isArray(chat?.participants) ? chat.participants.map((value) => String(value)).filter(Boolean) : [];
}

function buildFinalizationResult({ durationSeconds, participants, persistTranscript }) {
    return {
        durationSeconds,
        participants,
        isFriends: Boolean(persistTranscript),
        durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    };
}

async function closeChatAfterDisconnect(io, chat, {
    disconnectedUserId,
    waitingUserId,
    reason,
    applyStrictWarning = false,
}) {
    if (!chat?._id) return null;

    clearChatWaitingTimeout(chat._id);

    const persistTranscript = await getChatFriendSnapshot(chat);
    const endedAt = new Date();
    const durationSeconds = getActiveChatDurationSeconds(chat, { endedAt });

    let warning = { warningCount30Days: 0, lifeDeducted: false };
    if (applyStrictWarning && !persistTranscript && disconnectedUserId) {
        warning = await registerStrictDisconnectWarning(disconnectedUserId, chat._id, io);
    }

    return finalizeCompletedChat(io, chat, {
        endedAt,
        durationSeconds,
        persistTranscript,
        chatEndedPayload: buildDisconnectEndedPayload({
            reason,
            duration: durationSeconds,
            waitingUserId,
            disconnectedUserId,
            warning,
        }),
    });
}

async function startWaitingForReconnect(io, chatId, disconnectedUserId, waitingUserId) {
    const chat = await getChatById(chatId);
    if (!chat || chat.status !== 'active') return;
    clearActiveChatContext(chatId);
    const now = Date.now();
    const activeElapsedSeconds = getActiveChatDurationSeconds(chat, { endedAt: new Date(now) });
    const strictMode = activeElapsedSeconds < Math.floor(CHAT_STRICT_PHASE_MS / 1000);

    if (!strictMode) {
        await closeChatAfterDisconnect(io, chat, {
            disconnectedUserId,
            waitingUserId,
            reason: 'partner_left_after_five_minutes',
            applyStrictWarning: false,
        });
        return;
    }

    const disconnectedKey = String(disconnectedUserId);
    const { disconnectionCount, newDisconnectCount } = buildNextDisconnectionCount(chat.disconnectionCount, disconnectedKey);

    if (newDisconnectCount > MAX_DISCONNECTS_PER_CHAT) {
        const updatedChat = await updateChatById(chatId, { disconnection_count: disconnectionCount });
        await endChatDueToMaxDisconnects(io, updatedChat || chat, disconnectedUserId, waitingUserId);
        return;
    }

    const nextWaitingState = buildWaitingState({
        disconnectedUserId,
        waitingSince: now,
        activeElapsedSeconds,
    });

    await updateChatById(chatId, { waiting_state: nextWaitingState, disconnection_count: disconnectionCount });

    io.to(`user-${waitingUserId}`).emit('partner_disconnected', buildSocketMessageKey('chat.partner_connection_lost_wait', {
        chatId,
        disconnectCount: newDisconnectCount,
        maxDisconnects: MAX_DISCONNECTS_PER_CHAT,
        timeLeft: 60,
        activeElapsedSeconds,
        strictMode: true,
    }));

    const timeoutId = setTimeout(async () => {
        await handleWaitingTimeout(io, chatId, disconnectedUserId, waitingUserId);
    }, WAITING_TIMEOUT_MS);

    setChatWaitingTimeout(chatId, timeoutId);
}

async function handleWaitingTimeout(io, chatId, disconnectedUserId, waitingUserId) {
    const chat = await getChatById(chatId);
    if (!chat || chat.status !== 'active' || !chat.waitingState?.isWaiting) {
        return;
    }

    await closeChatAfterDisconnect(io, chat, {
        disconnectedUserId,
        waitingUserId,
        reason: 'partner_not_returned',
        applyStrictWarning: true,
    });
}

async function handlePartnerReconnected(io, chatId, userId) {
    const chat = await getChatById(chatId);
    if (!chat || chat.status !== 'active' || !chat.waitingState?.isWaiting) {
        return;
    }

    if (chat.waitingState.disconnectedUserId.toString() !== userId.toString()) {
        return;
    }

    clearChatWaitingTimeout(chatId);

    const waitingUserId = chat.participants.find(p => p.toString() !== userId.toString());

    const resumedAt = new Date();
    const adjustedStartedAt = getAdjustedStartedAtAfterWaiting(chat, resumedAt);
    const adjustedStartedAtIso = adjustedStartedAt ? adjustedStartedAt.toISOString() : null;

    const updatedChat = await updateChatById(chatId, {
        waiting_state: null,
        ...(adjustedStartedAtIso ? { started_at: adjustedStartedAtIso } : {}),
    });
    await primeActiveChatContext(updatedChat || {
        ...chat,
        waitingState: null,
        startedAt: adjustedStartedAt || chat.startedAt,
    });

    io.to(`user-${waitingUserId}`).emit('partner_reconnected', buildSocketMessageKey('chat.partner_reconnected', {
        chatId,
        ...(adjustedStartedAtIso ? { startedAt: adjustedStartedAtIso } : {}),
    }));

    io.to(`user-${userId}`).emit('chat_resumed', buildSocketMessageKey('chat.chat_resumed', {
        chatId,
        ...(adjustedStartedAtIso ? { startedAt: adjustedStartedAtIso } : {}),
    }));
}

async function endChatDueToMaxDisconnects(io, chat, disconnectedUserId, waitingUserId) {
    await closeChatAfterDisconnect(io, chat, {
        disconnectedUserId,
        waitingUserId,
        reason: 'max_disconnects',
        applyStrictWarning: true,
    });
}

async function finalizeCompletedChat(io, chat, {
    status = 'ended',
    endedAt = new Date(),
    durationSeconds = null,
    reportedTotalDurationSeconds = null,
    persistTranscript = false,
    keepForAppeal = false,
    autoResolveAt = null,
    leftEarlyUserId = null,
    chatPatch = {},
    chatEndedPayload = null,
    emitRatePrompt = false,
} = {}) {
    if (!chat?._id) return null;

    const endDate = endedAt instanceof Date ? endedAt : new Date(endedAt || Date.now());
    const safeDurationSeconds = getCompletedChatDurationSeconds(chat, {
        endedAt: endDate,
        durationSeconds,
        reportedTotalDurationSeconds,
    });

    await updateChatById(chat._id, {
        status,
        ended_at: endDate.toISOString(),
        duration: safeDurationSeconds,
        waiting_state: null,
        ...chatPatch,
    });
    clearChatPreparationTimeout(chat._id);
    clearActiveChatContext(chat._id);

    const participants = normalizeFinalizationParticipants(chat);
    clearUsersActiveChat(participants);
    await setUsersChatStatus(participants, 'available');

    if (io) {
        const payload = chatEndedPayload || { duration: safeDurationSeconds };
        io.to(`${CHAT_ROOM_PREFIX}${chat._id}`).emit('chat_ended', payload);
        if (emitRatePrompt) {
            io.to(`${CHAT_ROOM_PREFIX}${chat._id}`).emit('rate_partner');
        }
    }

    runDeferredChatFinalization(async () => {
        await applyChatCompletionEffects({
            chatId: chat._id,
            durationSeconds: safeDurationSeconds,
            leftEarlyUserId,
            isFriendsSnapshot: persistTranscript,
        });
        await finalizeChatTranscript(chat._id, {
            persist: persistTranscript,
            keepForAppeal,
            autoResolveAt,
        });
    }, 'Deferred transcript finalization error:');

    return buildFinalizationResult({
        durationSeconds: safeDurationSeconds,
        participants,
        persistTranscript,
    });
}

async function closeIdleChatIfNeeded(io, chat) {
    if (!chat?._id || chat.status !== 'active') return false;
    if (chat.waitingState?.isWaiting && chat.waitingState?.mode !== 'soft') return false;

    const state = await chatService.getTranscriptState(chat._id);
    const idleDeadline = getChatIdleDeadline(state, chat);
    if (!idleDeadline) return false;
    if (Date.now() < idleDeadline) return false;
    const durationSeconds = getActiveChatDurationSeconds(chat, { endedAt: new Date(idleDeadline) });
    const persistTranscript = await getChatFriendSnapshot(chat);

    await finalizeCompletedChat(io, chat, {
        endedAt: new Date(idleDeadline),
        durationSeconds,
        persistTranscript,
        chatEndedPayload: {
            reason: 'idle_timeout',
            duration: durationSeconds,
        },
    });
    return true;
}

module.exports = {
    buildDisconnectEndedPayload,
    buildFinalizationResult,
    buildNextDisconnectionCount,
    buildWaitingState,
    closeChatAfterDisconnect,
    closeIdleChatIfNeeded,
    endChatDueToMaxDisconnects,
    finalizeCompletedChat,
    handlePartnerReconnected,
    handleWaitingTimeout,
    normalizeFinalizationParticipants,
    startWaitingForReconnect,
};
