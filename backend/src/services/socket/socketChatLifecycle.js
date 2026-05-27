const chatService = require('../chatService');
const friendService = require('../friendService');
const {
    getUserLanguageFromRow,
    getUserRowById,
} = require('./socketDataStore');
const {
    getActiveChatContext,
    getChatPreparationState,
    setActiveChatContext,
} = require('./socketChatContextStore');

function normalizeTranscriptParticipants(chat) {
    return Array.isArray(chat?.participants) ? chat.participants.map((value) => String(value)) : [];
}

function normalizeContextParticipants(chat) {
    return Array.isArray(chat?.participants) ? chat.participants.map((value) => String(value)).filter(Boolean) : [];
}

function getChatStartedAtIso(chat, fallback = new Date()) {
    return chat?.startedAt ? new Date(chat.startedAt).toISOString() : fallback.toISOString();
}

function buildPrimedChatContext(chat, state = {}, preparation = {}, participants = normalizeContextParticipants(chat), now = new Date()) {
    return {
        participants,
        participantLanguages: state?.participantLanguages || {},
        startedAt: getChatStartedAtIso(chat, now),
        status: chat?.status || 'active',
        isFriend: typeof state?.isFriendSnapshot === 'boolean' ? state.isFriendSnapshot : null,
        readyAt: preparation.readyAt || null,
        isPreparing: preparation.isPreparing,
    };
}

function buildFriendSnapshotContext(chat, context = {}, participants = normalizeContextParticipants(chat), isFriend = false, preparation = getChatPreparationState(chat)) {
    return {
        ...(context || {}),
        participants: participants.length ? participants : context?.participants || [],
        participantLanguages: context?.participantLanguages || {},
        startedAt: context?.startedAt || (chat?.startedAt ? new Date(chat.startedAt).toISOString() : null),
        status: chat?.status || context?.status || 'active',
        isFriend,
        readyAt: preparation.readyAt || context?.readyAt || null,
        isPreparing: preparation.isPreparing || Boolean(context?.isPreparing),
    };
}

async function finalizeChatTranscript(chatId, { persist = false, keepForAppeal = false, autoResolveAt = null } = {}) {
    try {
        if (!chatId) return;
        if (keepForAppeal) {
            await chatService.markForAppeal(chatId, autoResolveAt);
            return;
        }
        if (persist) {
            await chatService.persistTranscript(chatId);
            return;
        }
        await chatService.cleanupTranscript(chatId);
    } catch (error) {
        console.error('Error finalizing chat transcript:', error);
    }
}

async function ensureChatTranscriptMetadata(chat) {
    if (!chat?._id) return null;
    const state = await chatService.ensureTranscriptState(chat._id);
    const participants = normalizeTranscriptParticipants(chat);
    const hasLanguages = state?.participantLanguages && typeof state.participantLanguages === 'object' && participants.every((id) => state.participantLanguages[String(id)]);
    if (hasLanguages && typeof state?.isFriendSnapshot === 'boolean') return state;

    const rows = await Promise.all(participants.map((userId) => getUserRowById(userId)));
    const participantLanguages = {};
    participants.forEach((userId, index) => {
        participantLanguages[String(userId)] = getUserLanguageFromRow(rows[index]);
    });
    let isFriendSnapshot = typeof state?.isFriendSnapshot === 'boolean'
        ? state.isFriendSnapshot
        : false;
    if (typeof state?.isFriendSnapshot !== 'boolean' && participants.length >= 2) {
        isFriendSnapshot = await friendService.areUsersFriends(participants[0], participants[1]).catch(() => false);
    }

    const startedAt = chat.startedAt ? new Date(chat.startedAt).toISOString() : new Date().toISOString();
    const lastActivityAt = state?.lastActivityAt || (chat.startedAt ? new Date(chat.startedAt).toISOString() : new Date().toISOString());
    return chatService.touchChatActivity(chat._id, {
        participantLanguages,
        isFriendSnapshot,
        startedAt,
        lastActivityAt,
    });
}

async function primeActiveChatContext(chat) {
    if (!chat?._id) return null;
    const chatId = String(chat._id);
    const existing = getActiveChatContext(chatId);
    const participants = normalizeContextParticipants(chat);
    const hasExistingLanguages = existing?.participantLanguages
        && participants.every((id) => existing.participantLanguages[String(id)]);
    if (existing && hasExistingLanguages) {
        return existing;
    }

    const state = await ensureChatTranscriptMetadata(chat);
    const preparation = getChatPreparationState(chat);
    return setActiveChatContext(chatId, buildPrimedChatContext(chat, state, preparation, participants));
}

async function getChatFriendSnapshot(chat) {
    if (!chat?._id) return false;
    const context = await primeActiveChatContext(chat);
    if (typeof context?.isFriend === 'boolean') {
        return context.isFriend;
    }

    const participants = normalizeContextParticipants(chat);
    const isFriend = participants.length >= 2
        ? await friendService.areUsersFriends(participants[0], participants[1]).catch(() => false)
        : false;

    setActiveChatContext(chat._id, buildFriendSnapshotContext(chat, context, participants, isFriend));

    await chatService.touchChatActivity(chat._id, {
        isFriendSnapshot: isFriend,
    }).catch(() => {});

    return isFriend;
}

function runDeferredChatFinalization(task, label) {
    setTimeout(() => {
        Promise.resolve()
            .then(task)
            .catch((error) => {
                console.error(label, error);
            });
    }, 0);
}

async function getParticipantLanguagesForChat(chat) {
    const context = await primeActiveChatContext(chat);
    return context?.participantLanguages && typeof context.participantLanguages === 'object'
        ? context.participantLanguages
        : {};
}

module.exports = {
    buildFriendSnapshotContext,
    buildPrimedChatContext,
    ensureChatTranscriptMetadata,
    finalizeChatTranscript,
    getChatFriendSnapshot,
    getChatStartedAtIso,
    getParticipantLanguagesForChat,
    normalizeContextParticipants,
    normalizeTranscriptParticipants,
    primeActiveChatContext,
    runDeferredChatFinalization,
};
