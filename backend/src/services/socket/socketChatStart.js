const crypto = require('crypto');
const matchingService = require('../matchingService');
const chatService = require('../chatService');
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { getChatById } = require('./socketDataStore');
const { getUserRoomName } = require('./socketRooms');
const {
    getActiveChatContext,
    setActiveChatContext,
} = require('./socketChatContextStore');
const {
    deleteChatPreparationTimeout,
    setChatPreparationTimeout,
} = require('./socketChatTimeouts');
const { setUserActiveChat } = require('./socketActiveChats');
const { setUsersChatStatus } = require('./socketUserStatus');
const { runDeferredChatFinalization } = require('./socketChatLifecycle');
const { stopSearchForMatchedUser } = require('./socketRuntimeLifecycle');

const CHAT_ROOM_PREFIX = 'chat-';

function getChatPrepareDelayMs(envValue = process.env.CHAT_PREPARE_DELAY_MS) {
    return Math.max(0, Number(envValue) || 15000);
}

function buildChatInsertPayload({
    chatId,
    user1Id,
    user2Id,
    readyAtIso,
    nowIso,
}) {
    const u1 = String(user1Id);
    const u2 = String(user2Id);
    return {
        id: chatId,
        participants: [u1, u2],
        status: 'active',
        started_at: readyAtIso,
        disconnection_count: { [u1]: 0, [u2]: 0 },
        created_at: nowIso,
        updated_at: nowIso,
    };
}

function buildInitialChatContext({
    user1Id,
    user2Id,
    participantLanguages,
    readyAtIso,
    isFriendSnapshot,
    prepareDelayMs,
}) {
    const u1 = String(user1Id);
    const u2 = String(user2Id);
    return {
        participants: [u1, u2],
        participantLanguages,
        startedAt: readyAtIso,
        status: 'active',
        isFriend: Boolean(isFriendSnapshot),
        readyAt: readyAtIso,
        isPreparing: prepareDelayMs > 0,
    };
}

function buildPreparedChatContext({
    previousContext = {},
    user1Id,
    user2Id,
    participantLanguages,
    readyAtIso,
    isFriendSnapshot,
}) {
    const u1 = String(user1Id);
    const u2 = String(user2Id);
    return {
        ...previousContext,
        participants: [u1, u2],
        participantLanguages: {
            [u1]: participantLanguages[u1],
            [u2]: participantLanguages[u2],
        },
        startedAt: readyAtIso,
        status: 'active',
        isFriend: Boolean(isFriendSnapshot),
        readyAt: readyAtIso,
        isPreparing: false,
    };
}

function buildChatPreparingPayload({ chatId, countdownSeconds, readyAtIso }) {
    return {
        chatId: String(chatId),
        countdownSeconds,
        readyAt: readyAtIso,
    };
}

function getParticipantLanguages(user1Id, user2Id) {
    const u1 = String(user1Id);
    const u2 = String(user2Id);
    const user1Profile = matchingService.getOnlineProfile(user1Id);
    const user2Profile = matchingService.getOnlineProfile(user2Id);
    return {
        [u1]: String(user1Profile?.language || 'ru'),
        [u2]: String(user2Profile?.language || 'ru'),
    };
}

async function joinUsersToChatRoom(io, user1Id, user2Id, chatId) {
    const chatRoomName = `${CHAT_ROOM_PREFIX}${chatId}`;
    try {
        await Promise.all([
            io.in(getUserRoomName(user1Id)).socketsJoin(chatRoomName),
            io.in(getUserRoomName(user2Id)).socketsJoin(chatRoomName),
        ]);
    } catch (_error) {
        // ignore room join failures; page will retry join on open
    }
}

function emitChatPreparing(io, user1Id, user2Id, payload) {
    io.to(getUserRoomName(user1Id)).emit('chat_preparing', payload);
    io.to(getUserRoomName(user2Id)).emit('chat_preparing', payload);
}

function emitPartnerFound(io, user1Id, user2Id, chatId) {
    io.to(getUserRoomName(user1Id)).emit('partner_found', { chatId: String(chatId) });
    io.to(getUserRoomName(user2Id)).emit('partner_found', { chatId: String(chatId) });
}

async function startChat(io, user1Id, user2Id, options = {}) {
    await Promise.all([
        stopSearchForMatchedUser(user1Id),
        stopSearchForMatchedUser(user2Id),
    ]);

    const supabase = getSupabaseClient();
    const chatId = crypto.randomBytes(12).toString('hex');
    const now = Date.now();
    const prepareDelayMs = getChatPrepareDelayMs();
    const nowIso = new Date(now).toISOString();
    const readyAtIso = new Date(now + prepareDelayMs).toISOString();
    const countdownSeconds = Math.max(0, Math.ceil(prepareDelayMs / 1000));
    const u1 = String(user1Id);
    const u2 = String(user2Id);
    const { data: createdRow, error } = await supabase
        .from('chats')
        .insert(buildChatInsertPayload({
            chatId,
            user1Id: u1,
            user2Id: u2,
            readyAtIso,
            nowIso,
        }))
        .select('id')
        .maybeSingle();
    if (error || !createdRow) {
        throw new Error('Failed to create chat');
    }

    const participantLanguages = getParticipantLanguages(user1Id, user2Id);
    const isFriendSnapshot = Boolean(options.isFriendSnapshot);

    setActiveChatContext(String(createdRow.id), buildInitialChatContext({
        user1Id: u1,
        user2Id: u2,
        participantLanguages,
        readyAtIso,
        isFriendSnapshot,
        prepareDelayMs,
    }));

    // Сохраняем связь userId -> chatId
    setUserActiveChat(u1, createdRow.id);
    setUserActiveChat(u2, createdRow.id);
    matchingService.updateOnlineUser(u1, { chatStatus: 'in_chat', isSearching: false, searchStartedAt: 0 });
    matchingService.updateOnlineUser(u2, { chatStatus: 'in_chat', isSearching: false, searchStartedAt: 0 });
    matchingService.addRecentPartnerRuntime(u1, u2);
    matchingService.addRecentPartnerRuntime(u2, u1);

    runDeferredChatFinalization(async () => {
        const currentChat = await getChatById(createdRow.id);
        const stillActive = currentChat?.status === 'active';
        await Promise.all([
            chatService.touchChatActivity(String(createdRow.id), {
                startedAt: readyAtIso,
                lastActivityAt: nowIso,
                isFriendSnapshot,
                participantLanguages,
            }),
            stillActive ? setUsersChatStatus([user1Id, user2Id], 'in_chat') : null,
            matchingService.updateChatHistory(user1Id, user2Id),
        ]);
    }, 'Deferred chat start persistence error:');

    await joinUsersToChatRoom(io, u1, u2, chatId);

    const preparingPayload = buildChatPreparingPayload({
        chatId: createdRow.id,
        countdownSeconds,
        readyAtIso,
    });
    emitChatPreparing(io, u1, u2, preparingPayload);

    if (prepareDelayMs <= 0) {
        emitPartnerFound(io, u1, u2, createdRow.id);
        return;
    }

    const preparationTimeoutId = setTimeout(async () => {
        deleteChatPreparationTimeout(createdRow.id);

        try {
            const currentChat = await getChatById(createdRow.id);
            if (!currentChat || currentChat.status !== 'active') {
                return;
            }

            setActiveChatContext(String(createdRow.id), buildPreparedChatContext({
                previousContext: getActiveChatContext(String(createdRow.id)) || {},
                user1Id: u1,
                user2Id: u2,
                participantLanguages,
                readyAtIso,
                isFriendSnapshot,
            }));

            emitPartnerFound(io, u1, u2, createdRow.id);
        } catch (timeoutError) {
            console.error('Error finishing chat preparation:', timeoutError);
        }
    }, prepareDelayMs);

    setChatPreparationTimeout(createdRow.id, preparationTimeoutId);
}

module.exports = {
    buildChatInsertPayload,
    buildChatPreparingPayload,
    buildInitialChatContext,
    buildPreparedChatContext,
    getChatPrepareDelayMs,
    startChat,
};
