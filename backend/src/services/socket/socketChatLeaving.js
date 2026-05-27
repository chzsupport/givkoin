const {
    getChatById,
    getUserData,
    getUserRowById,
    updateUserDataById,
} = require('./socketDataStore');
const { getActiveChatDurationSeconds } = require('./socketTiming');
const { clearChatWaitingTimeout } = require('./socketChatTimeouts');
const { getChatFriendSnapshot } = require('./socketChatLifecycle');
const { finalizeCompletedChat } = require('./socketChatSessionLifecycle');

const CHAT_ROOM_PREFIX = 'chat-';
const CHAT_MIN_SAFE_SECONDS = 300;

function shouldDeductLifeOnLeave({ duration, isFriends }) {
    return Number(duration) < CHAT_MIN_SAFE_SECONDS && !isFriends;
}

function shouldDeductLifeWhileWaiting({ isFriends, isStrictWaiting }) {
    return !isFriends && Boolean(isStrictWaiting);
}

function getLivesAfterPenalty(userData) {
    return Math.max(0, (Number(userData?.lives) || 0) - 1);
}

function buildLeftWaitingPayload({ duration, lifeDeducted }) {
    return {
        reason: 'left_waiting',
        duration,
        lifeDeducted: Boolean(lifeDeducted),
    };
}

async function deductLife(userId) {
    const row = await getUserRowById(userId);
    const data = getUserData(row);
    const lives = getLivesAfterPenalty(data);
    await updateUserDataById(userId, { lives });
}

async function handleWaitingLeave(io, chat, currentUserId, {
    chatId,
    reportedTotalDurationSeconds,
    now,
    isFriends,
}) {
    const isStrictWaiting = chat.waitingState?.mode !== 'soft';
    const duration = getActiveChatDurationSeconds(chat, {
        endedAt: new Date(now),
        reportedTotalDurationSeconds,
    });
    const lifeDeducted = shouldDeductLifeWhileWaiting({ isFriends, isStrictWaiting });

    clearChatWaitingTimeout(chatId);

    if (lifeDeducted) {
        await deductLife(currentUserId);
    }

    await finalizeCompletedChat(io, chat, {
        endedAt: new Date(now),
        durationSeconds: duration,
        persistTranscript: isFriends,
        leftEarlyUserId: currentUserId,
        chatEndedPayload: buildLeftWaitingPayload({ duration, lifeDeducted }),
        emitRatePrompt: true,
    });
}

async function handleLeaveChat(io, socket, currentUserId, { chatId, reportedTotalDurationSeconds } = {}) {
    const chat = await getChatById(chatId);
    if (!chat || chat.status !== 'active') return;

    const now = Date.now();
    const isFriends = await getChatFriendSnapshot(chat);

    if (chat.waitingState?.isWaiting) {
        await handleWaitingLeave(io, chat, currentUserId, {
            chatId,
            reportedTotalDurationSeconds,
            now,
            isFriends,
        });
        return;
    }

    const duration = getActiveChatDurationSeconds(chat, {
        endedAt: new Date(now),
        reportedTotalDurationSeconds,
    });

    if (shouldDeductLifeOnLeave({ duration, isFriends })) {
        await deductLife(currentUserId);
        socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_left_early');
    }

    await finalizeCompletedChat(io, chat, {
        endedAt: new Date(now),
        durationSeconds: duration,
        persistTranscript: isFriends,
        leftEarlyUserId: currentUserId,
        emitRatePrompt: true,
    });
}

async function handleConfirmLeaveWaiting(io, currentUserId, { chatId } = {}) {
    const chat = await getChatById(chatId);
    if (!chat || chat.status !== 'active' || !chat.waitingState?.isWaiting) return;

    const isFriends = await getChatFriendSnapshot(chat);
    const isStrictWaiting = chat.waitingState?.mode !== 'soft';
    const lifeDeducted = shouldDeductLifeWhileWaiting({ isFriends, isStrictWaiting });

    if (lifeDeducted) {
        await deductLife(currentUserId);
    }

    clearChatWaitingTimeout(chatId);

    const endedAt = new Date();
    const duration = getActiveChatDurationSeconds(chat, { endedAt });

    await finalizeCompletedChat(io, chat, {
        endedAt,
        durationSeconds: duration,
        persistTranscript: isFriends,
        leftEarlyUserId: currentUserId,
        chatEndedPayload: buildLeftWaitingPayload({ duration, lifeDeducted }),
        emitRatePrompt: true,
    });
}

module.exports = {
    buildLeftWaitingPayload,
    getLivesAfterPenalty,
    handleConfirmLeaveWaiting,
    handleLeaveChat,
    shouldDeductLifeOnLeave,
    shouldDeductLifeWhileWaiting,
};
