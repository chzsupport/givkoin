const matchingService = require('../matchingService');
const { isComplaintBlocked } = require('../../utils/penalties');
const { normalizeComplaintReason } = require('../../utils/complaintReason');
const {
    getChatById,
    getUserData,
    getUserRowById,
    updateUserDataById,
} = require('./socketDataStore');
const {
    findAppealByChat,
    findAppealByUser,
    insertAppeal,
} = require('./socketAppeals');
const { getActiveChatDurationSeconds } = require('./socketTiming');
const { finalizeCompletedChat } = require('./socketChatSessionLifecycle');

const AUTO_RESOLVE_HOURS = 24;
const CHAT_ROOM_PREFIX = 'chat-';

function hoursFromNow(hours, nowMs = Date.now()) {
    return new Date(nowMs + hours * 60 * 60 * 1000);
}

function buildBlockedUserEntry(userId, untilIso) {
    return { userId: String(userId), until: untilIso, reason: 'quarrel' };
}

function replaceBlockedUser(blockedUsers, userId, untilIso) {
    const existing = Array.isArray(blockedUsers) ? blockedUsers : [];
    return [
        ...existing.filter((blocked) => String(blocked?.userId) !== String(userId)),
        buildBlockedUserEntry(userId, untilIso),
    ];
}

function buildComplaintPayload({
    from,
    to,
    reason,
    createdAtIso,
    appealId,
    autoResolveAt,
}) {
    return {
        from: String(from),
        to: String(to || ''),
        reason,
        createdAt: createdAtIso,
        ...(appealId ? { appealId } : {}),
        autoResolveAt,
    };
}

function buildAppealPayload({
    chatId,
    complainant,
    againstUser,
    reason,
    autoResolveAt,
}) {
    return {
        chat: chatId,
        complainant,
        againstUser,
        reason,
        description: '',
        messagesSnapshot: [],
        autoResolveAt,
    };
}

function notifyChatClosed(io, chatId, data) {
    if (!io) return;
    io.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('chat_closed', {
        reason: data.reason || 'complaint',
        complainant: data.complainant,
        appealId: data.appealId,
    });
}

async function handleComplaint(io, currentUserId, { chatId, reason, reportedTotalDurationSeconds } = {}) {
    const chat = await getChatById(chatId);
    if (!chat) return;

    if (!(chat.participants || []).map(String).includes(String(currentUserId))) return;

    const userRow = await getUserRowById(currentUserId);
    if (!userRow) return;
    const userData = getUserData(userRow);
    const chips = Number(userData.complaintChips) || 0;
    if (chips <= 0) return;

    if (isComplaintBlocked({ complaintBlockedUntil: userData.complaintBlockedUntil })) return;

    const hasPendingAgainst = await findAppealByUser(currentUserId, 'pending');
    if (hasPendingAgainst) return;

    // Check duration >= 5 mins (300s)
    const duration = getActiveChatDurationSeconds(chat, {
        endedAt: new Date(),
        reportedTotalDurationSeconds,
    });
    if (duration < 300) return;

    // Deduct chip before reason normalization to keep the old socket behavior.
    await updateUserDataById(currentUserId, { complaintChips: Math.max(0, chips - 1) });

    const opponentId = chat.participants.find(p => p.toString() !== currentUserId);
    const now = new Date();
    const normalizedReason = normalizeComplaintReason(reason);
    if (!normalizedReason) return;

    const blockedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const blockedUntilIso = blockedUntil.toISOString();
    const opponentRow = await getUserRowById(opponentId);
    const opponentData = getUserData(opponentRow);
    const nextBlocked = replaceBlockedUser(userData.blockedUsers, opponentId, blockedUntilIso);
    const nextOpponentBlocked = replaceBlockedUser(opponentData.blockedUsers, currentUserId, blockedUntilIso);

    await Promise.all([
        updateUserDataById(currentUserId, { blockedUsers: nextBlocked }),
        updateUserDataById(opponentId, { blockedUsers: nextOpponentBlocked }),
    ]);
    matchingService.updateOnlineUser(currentUserId, { blockedUsers: nextBlocked });
    matchingService.updateOnlineUser(opponentId, { blockedUsers: nextOpponentBlocked });

    const existingAppeal = await findAppealByChat(chatId, currentUserId, opponentId, 'pending');
    let appealId = existingAppeal?._id || existingAppeal?.id;
    const autoResolveAt = hoursFromNow(AUTO_RESOLVE_HOURS).toISOString();
    if (!existingAppeal) {
        const appeal = await insertAppeal(buildAppealPayload({
            chatId,
            complainant: currentUserId,
            againstUser: opponentId,
            reason: normalizedReason,
            autoResolveAt,
        }));
        appealId = appeal._id;
    }

    const nextComplaint = buildComplaintPayload({
        from: currentUserId,
        to: opponentId,
        reason: normalizedReason,
        createdAtIso: now.toISOString(),
        appealId,
        autoResolveAt,
    });

    await finalizeCompletedChat(io, chat, {
        status: 'complained',
        endedAt: now,
        durationSeconds: duration,
        keepForAppeal: true,
        autoResolveAt,
        chatPatch: {
            complaint: nextComplaint,
        },
        chatEndedPayload: {
            reason: 'complaint',
        },
    });

    notifyChatClosed(io, chatId, {
        reason: 'complaint',
        complainant: currentUserId,
        appealId,
    });
}

module.exports = {
    buildAppealPayload,
    buildBlockedUserEntry,
    buildComplaintPayload,
    handleComplaint,
    hoursFromNow,
    notifyChatClosed,
    replaceBlockedUser,
};
