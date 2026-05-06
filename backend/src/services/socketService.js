const matchingService = require('./matchingService');
const chatService = require('./chatService');
const crypto = require('crypto');
const kService = require('./kService');
const emailService = require('./emailService');
const { isComplaintBlocked } = require('../utils/penalties');
const { awardRadianceForActivity } = require('./activityRadianceService');
const friendService = require('./friendService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { normalizeRequestLanguage } = require('../utils/requestLanguage');
const { normalizeComplaintReason } = require('../utils/complaintReason');
const {
    applyChatCompletionEffects,
    computeChatDurationSeconds,
    computeDurationSeconds,
} = require('./chatCompletionService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const {
    getQueuedUser: getSharedQueuedUser,
    addToQueue: addSharedToQueue,
    removeFromQueue: removeSharedFromQueue,
    setPendingCall,
    getPendingCallRecord,
    getPendingCall,
    hasPendingCall,
    clearPendingCall: clearSharedPendingCall,
    clearPendingCallsForUser: clearSharedPendingCallsForUser,
    resetRuntimeState: resetSharedRuntimeState,
} = require('./socketRuntimeStateService');

const CHAT_ROOM_PREFIX = 'chat-';
const SEARCH_CALL_TIMEOUT_MS = 60000;
const SEARCH_MAX_ROUNDS = 3;
const CHAT_PREPARE_DELAY_MS = Math.max(0, Number(process.env.CHAT_PREPARE_DELAY_MS) || 15000);

function getSocketSiteLanguage(socket) {
    return normalizeRequestLanguage(socket?.data?.siteLanguage || 'ru');
}

function pickSocketText(socket, ru, en) {
    return getSocketSiteLanguage(socket) === 'en' ? en : ru;
}

function buildSocketMessage(socket, messageKey, ru, en, extra = {}) {
    return {
        ...extra,
        messageKey,
        message: pickSocketText(socket, ru, en),
    };
}

function buildSocketMessageKey(messageKey, extra = {}) {
    return {
        ...extra,
        messageKey,
    };
}

async function findAppealByUser(againstUser, status) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'Appeal')
        .limit(500);
    if (error || !Array.isArray(data)) return null;
    return data.find((row) => {
        const d = row.data || {};
        return String(d.againstUser) === String(againstUser) && d.status === status;
    }) || null;
}

async function findAppealByChat(chatId, complainant, againstUser, status) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'Appeal')
        .limit(500);
    if (error || !Array.isArray(data)) return null;
    return data.find((row) => {
        const d = row.data || {};
        return String(d.chat) === String(chatId) &&
               String(d.complainant) === String(complainant) &&
               String(d.againstUser) === String(againstUser) &&
               d.status === status;
    }) || null;
}

async function insertAppeal(doc) {
    const supabase = getSupabaseClient();
    const id = `app_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    await supabase.from(DOC_TABLE).insert({
        model: 'Appeal',
        id,
        data: doc,
        created_at: nowIso,
        updated_at: nowIso,
    });
    return { ...doc, _id: id };
}

function toId(value, depth = 0) {
    if (depth > 3) return '';
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'object') {
        if (value._id != null) return toId(value._id, depth + 1);
        if (value.id != null) return toId(value.id, depth + 1);
        if (value.value != null) return toId(value.value, depth + 1);
        if (typeof value.toString === 'function') {
            const s = value.toString();
            if (s && s !== '[object Object]') return s;
        }
    }
    return '';
}

function mapChatRow(row) {
    if (!row) return null;
    return {
        _id: row.id,
        participants: Array.isArray(row.participants) ? row.participants : [],
        status: row.status,
        startedAt: row.started_at ? new Date(row.started_at) : null,
        endedAt: row.ended_at ? new Date(row.ended_at) : null,
        duration: Number(row.duration || 0),
        messagesCount: row.messages_count && typeof row.messages_count === 'object' ? row.messages_count : {},
        ratings: Array.isArray(row.ratings) ? row.ratings : [],
        complaint: row.complaint && typeof row.complaint === 'object' ? row.complaint : null,
        waitingState: row.waiting_state && typeof row.waiting_state === 'object' ? row.waiting_state : null,
        disconnectionCount: row.disconnection_count && typeof row.disconnection_count === 'object' ? row.disconnection_count : {},
        preparationState: row.preparation_state && typeof row.preparation_state === 'object' ? row.preparation_state : null,
    };
}

async function getChatById(chatId) {
    const id = toId(chatId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('id', String(id))
        .maybeSingle();
    if (error) return null;
    return mapChatRow(data);
}

async function findActiveChatByParticipant(userId) {
    const uid = toId(userId);
    if (!uid) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('status', 'active')
        .contains('participants', [String(uid)])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) return null;
    return mapChatRow(data);
}

async function listActiveChats(limit = 500) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('status', 'active')
        .limit(Math.max(1, Math.min(2000, Number(limit) || 500)));
    if (error || !Array.isArray(data)) return [];
    return data.map(mapChatRow).filter(Boolean);
}

async function updateChatById(chatId, patch) {
    const id = toId(chatId);
    if (!id || !patch || typeof patch !== 'object') return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('chats')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', String(id))
        .select('*')
        .maybeSingle();
    if (error) return null;
    return mapChatRow(data);
}

async function getUserRowById(userId) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,language,data')
        .eq('id', String(id))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

function getUserLanguageFromRow(row) {
    if (!row) return 'ru';
    if (row.language) return String(row.language);
    const data = getUserData(row);
    if (data.language) return String(data.language);
    return 'ru';
}

function setDeepValue(obj, path, value) {
    if (!obj || typeof obj !== 'object') return;
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
}

async function updateUserDataById(userId, patch) {
    const id = toId(userId);
    if (!id || !patch || typeof patch !== 'object') return null;
    const row = await getUserRowById(id);
    if (!row) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(id))
        .select('id,data,email,nickname,language')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataByIdDeepPatch(userId, changes = {}) {
    const id = toId(userId);
    if (!id || !changes || typeof changes !== 'object') return null;
    const row = await getUserRowById(id);
    if (!row) return null;
    const base = getUserData(row);
    const next = { ...base };
    for (const [path, value] of Object.entries(changes)) {
        setDeepValue(next, path, value);
    }
    return updateUserDataById(id, next);
}

const pendingCallTimeouts = new Map();
const searchSessions = new Map();
const searchPairLocks = new Set();

// Chat waiting timeouts: chatId -> timeoutId
const chatWaitingTimeouts = new Map();
const chatPreparationTimeouts = new Map();
// User to active chat mapping: userId -> chatId
const userActiveChat = new Map();
// Chat context cache: chatId -> { participants, participantLanguages, startedAt, status }
const activeChatContexts = new Map();

// Online users tracking (authenticated sockets)
const onlineUsers = new Set();

function normalizeUserId(userId) {
    return userId == null ? '' : userId.toString();
}

function getUserRoomName(userId) {
    return `user-${normalizeUserId(userId)}`;
}

async function hasUserRoom(io, userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey || !io) return false;

    try {
        if (typeof io.in === 'function') {
            const sockets = await io.in(getUserRoomName(userKey)).allSockets();
            return sockets.size > 0;
        }
    } catch (_error) {
        // Fallback to local adapter state below.
    }

    const room = io?.sockets?.adapter?.rooms?.get(getUserRoomName(userKey));
    return Boolean(room && room.size > 0);
}

async function getQueuedUser(userId) {
    return getSharedQueuedUser(normalizeUserId(userId));
}

function clearPendingCallTimeout(targetId) {
    const targetKey = normalizeUserId(targetId);
    const timeoutEntry = pendingCallTimeouts.get(targetKey);
    const timeoutId = timeoutEntry?.timeoutId || timeoutEntry;
    if (timeoutId) {
        clearTimeout(timeoutId);
        pendingCallTimeouts.delete(targetKey);
    }
}

function clearPendingCallTimeoutsForUser(userId) {
    const userKey = normalizeUserId(userId);
    for (const [targetId, timeoutEntry] of Array.from(pendingCallTimeouts.entries())) {
        const initiatorId = normalizeUserId(timeoutEntry?.initiatorId);
        const timeoutId = timeoutEntry?.timeoutId || timeoutEntry;
        if (targetId === userKey || initiatorId === userKey) {
            clearTimeout(timeoutId);
            pendingCallTimeouts.delete(targetId);
        }
    }
}

async function clearPendingCall(targetId) {
    const targetKey = normalizeUserId(targetId);
    clearPendingCallTimeout(targetKey);
    return clearSharedPendingCall(targetKey);
}

async function clearPendingCallsForUser(userId) {
    const userKey = normalizeUserId(userId);
    clearPendingCallTimeoutsForUser(userKey);
    await clearSharedPendingCallsForUser(userKey);
}

async function setUsersChatStatus(userIds, status) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(normalizeUserId).filter(Boolean))];
    if (!ids.length || !status) return;
    await Promise.all(
        ids.map(async (id) => {
            const row = await getUserRowById(id);
            if (!row) return;
            const data = getUserData(row);
            matchingService.updateOnlineUser(id, {
                chatStatus: status,
                isSearching: status === 'in_chat' ? false : undefined,
                searchStartedAt: status === 'in_chat' ? 0 : undefined,
            });
            if (data.chatStatus === status) return;
            await updateUserDataById(id, { chatStatus: status });
        })
    );
}

async function touchUserTimestamp(userId, field) {
    const userKey = normalizeUserId(userId);
    if (!userKey || !field) return;
    await updateUserDataById(userKey, { [field]: new Date().toISOString() });
}

function resetRuntimeState() {
    resetSharedRuntimeState();
    for (const timeoutEntry of pendingCallTimeouts.values()) {
        clearTimeout(timeoutEntry?.timeoutId || timeoutEntry);
    }
    pendingCallTimeouts.clear();
    searchSessions.clear();
    searchPairLocks.clear();
    for (const timeoutId of chatWaitingTimeouts.values()) clearTimeout(timeoutId);
    chatWaitingTimeouts.clear();
    for (const timeoutId of chatPreparationTimeouts.values()) clearTimeout(timeoutId);
    chatPreparationTimeouts.clear();
    userActiveChat.clear();
    activeChatContexts.clear();
    onlineUsers.clear();
}

function emitFriendsUpdated(io, userIds = []) {
    if (!io || !Array.isArray(userIds)) return;
    userIds
        .filter(Boolean)
        .forEach((id) => {
            const uid = id.toString();
            io.to(`user-${uid}`).emit('friends_updated', { userId: uid });
        });
}

function isUserOnline(userId) {
    if (!userId) return false;
    return onlineUsers.has(normalizeUserId(userId));
}

function getOnlineUserIds() {
    return Array.from(onlineUsers);
}

function getOnlineUserCount(io) {
    // If io is provided, prefer room-based check (source of truth)
    if (io?.sockets?.adapter?.rooms) {
        let count = 0;
        for (const [roomName, room] of io.sockets.adapter.rooms.entries()) {
            if (typeof roomName === 'string' && roomName.startsWith('user-') && room?.size > 0) {
                count += 1;
            }
        }
        return count;
    }
    return onlineUsers.size;
}

const AUTO_RESOLVE_HOURS = 24;
const WAITING_TIMEOUT_MS = 60000; // 1 минута на ожидание
const MAX_DISCONNECTS_PER_CHAT = 3; // Максимум 3 ожидания возврата в первые 5 минут
const CONNECTION_WARNING_WINDOW_DAYS = 30;
const CHAT_STRICT_PHASE_MS = 5 * 60 * 1000;
const CHAT_IDLE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const CHAT_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const CHAT_IDLE_SWEEP_INTERVAL_MS = 60 * 1000;

const hoursFromNow = (h) => new Date(Date.now() + h * 60 * 60 * 1000);

function getSearchSession(userId) {
    return searchSessions.get(normalizeUserId(userId)) || null;
}

function setSearchSession(session) {
    if (!session?.userId) return null;
    searchSessions.set(normalizeUserId(session.userId), session);
    return session;
}

function updateSearchSession(userId, patch = {}) {
    const current = getSearchSession(userId);
    if (!current) return null;
    const next = { ...current, ...patch };
    searchSessions.set(normalizeUserId(userId), next);
    return next;
}

function clearSearchSession(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;
    searchSessions.delete(userKey);
    matchingService.updateOnlineUser(userKey, {
        isSearching: false,
        searchStartedAt: 0,
    });
}

async function removeFromQueue(userId) {
    const userKey = normalizeUserId(userId);
    clearSearchSession(userKey);
    await removeSharedFromQueue(userKey);
}

async function stopSearchForMatchedUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;

    const isSearching = Boolean(getSearchSession(userKey)) || Boolean(await getQueuedUser(userKey));
    await clearPendingCallsForUser(userKey);

    if (isSearching) {
        await removeFromQueue(userKey);
    }
}

function getSearchPairLockKey(firstUserId, secondUserId) {
    return [normalizeUserId(firstUserId), normalizeUserId(secondUserId)].sort().join(':');
}

function acquireSearchPairLock(firstUserId, secondUserId) {
    const lockKey = getSearchPairLockKey(firstUserId, secondUserId);
    if (!lockKey || searchPairLocks.has(lockKey)) return null;
    searchPairLocks.add(lockKey);
    return lockKey;
}

function releaseSearchPairLock(lockKey) {
    if (!lockKey) return;
    searchPairLocks.delete(lockKey);
}

function clearCurrentCallForInitiator(initiatorId, targetId = null, callToken = null) {
    const userKey = normalizeUserId(initiatorId);
    const session = getSearchSession(userKey);
    if (!session) return null;
    if (targetId && normalizeUserId(session.currentTargetId) !== normalizeUserId(targetId)) return session;
    if (callToken && String(session.currentCallToken || '') !== String(callToken || '')) return session;
    return updateSearchSession(userKey, {
        currentTargetId: null,
        currentCallToken: '',
    });
}

function getWaitingSince(chat) {
    return chat?.waitingState?.isWaiting && chat.waitingState?.waitingSince
        ? chat.waitingState.waitingSince
        : null;
}

function getActiveChatDurationSeconds(chat, {
    endedAt = new Date(),
    reportedTotalDurationSeconds = null,
} = {}) {
    const endDate = endedAt instanceof Date ? endedAt : new Date(endedAt || Date.now());
    return computeChatDurationSeconds({
        startedAt: chat?.startedAt || endDate,
        endedAt: endDate,
        reportedTotalDurationSeconds,
        waitingSince: getWaitingSince(chat),
    });
}

function getAdjustedStartedAtAfterWaiting(chat, resumedAt = new Date()) {
    const startedAtMs = chat?.startedAt ? new Date(chat.startedAt).getTime() : Date.now();
    const waitingSinceMs = getWaitingSince(chat) ? new Date(getWaitingSince(chat)).getTime() : 0;
    const resumedAtMs = resumedAt instanceof Date ? resumedAt.getTime() : new Date(resumedAt || Date.now()).getTime();
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(waitingSinceMs) || !Number.isFinite(resumedAtMs)) {
        return null;
    }
    if (waitingSinceMs <= startedAtMs || resumedAtMs <= waitingSinceMs) {
        return null;
    }
    return new Date(startedAtMs + (resumedAtMs - waitingSinceMs));
}

async function closeChatAfterDisconnect(io, chat, {
    disconnectedUserId,
    waitingUserId,
    reason,
    applyStrictWarning = false,
}) {
    if (!chat?._id) return null;

    if (chatWaitingTimeouts.has(chat._id)) {
        clearTimeout(chatWaitingTimeouts.get(chat._id));
        chatWaitingTimeouts.delete(chat._id);
    }

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
        chatEndedPayload: {
            reason,
            duration: durationSeconds,
            waitingUserId: waitingUserId ? String(waitingUserId) : '',
            disconnectedUserId: disconnectedUserId ? String(disconnectedUserId) : '',
            lifeDeducted: Boolean(warning.lifeDeducted),
            warningCount30Days: Number(warning.warningCount30Days || 0),
        },
    });
}

// Функция для начала ожидания при отключении собеседника
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

    const disconnectedKey = normalizeUserId(disconnectedUserId);
    const disconnectionCount = chat.disconnectionCount && typeof chat.disconnectionCount === 'object' ? chat.disconnectionCount : {};
    const disconnectCount = Number(disconnectionCount[disconnectedKey]) || 0;
    const newDisconnectCount = disconnectCount + 1;
    disconnectionCount[disconnectedKey] = newDisconnectCount;

    if (newDisconnectCount > MAX_DISCONNECTS_PER_CHAT) {
        const updatedChat = await updateChatById(chatId, { disconnection_count: disconnectionCount });
        await endChatDueToMaxDisconnects(io, updatedChat || chat, disconnectedUserId, waitingUserId);
        return;
    }

    const nextWaitingState = {
        isWaiting: true,
        mode: 'strict',
        disconnectedUserId,
        waitingSince: now,
        activeElapsedSeconds,
    };

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

    chatWaitingTimeouts.set(chatId, timeoutId);
}

// Обработка истечения времени ожидания
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

// Обработка возвращения собеседника
async function handlePartnerReconnected(io, chatId, userId) {
    const chat = await getChatById(chatId);
    if (!chat || chat.status !== 'active' || !chat.waitingState?.isWaiting) {
        return;
    }

    // Проверяем, что это тот пользователь, который отключился
    if (chat.waitingState.disconnectedUserId.toString() !== userId.toString()) {
        return;
    }

    // Очищаем таймер ожидания
    if (chatWaitingTimeouts.has(chatId)) {
        clearTimeout(chatWaitingTimeouts.get(chatId));
        chatWaitingTimeouts.delete(chatId);
    }

    // Находим ожидающего пользователя
    const waitingUserId = chat.participants.find(p => p.toString() !== userId.toString());

    const resumedAt = new Date();
    const adjustedStartedAt = getAdjustedStartedAtAfterWaiting(chat, resumedAt);
    const adjustedStartedAtIso = adjustedStartedAt ? adjustedStartedAt.toISOString() : null;

    // Восстанавливаем состояние чата и сдвигаем старт на длину ожидания.
    const updatedChat = await updateChatById(chatId, {
        waiting_state: null,
        ...(adjustedStartedAtIso ? { started_at: adjustedStartedAtIso } : {}),
    });
    await primeActiveChatContext(updatedChat || {
        ...chat,
        waitingState: null,
        startedAt: adjustedStartedAt || chat.startedAt,
    });

    // Уведомляем ожидающего
    io.to(`user-${waitingUserId}`).emit('partner_reconnected', buildSocketMessageKey('chat.partner_reconnected', {
        chatId,
        ...(adjustedStartedAtIso ? { startedAt: adjustedStartedAtIso } : {}),
    }));

    // Уведомляем вернувшегося
    io.to(`user-${userId}`).emit('chat_resumed', buildSocketMessageKey('chat.chat_resumed', {
        chatId,
        ...(adjustedStartedAtIso ? { startedAt: adjustedStartedAtIso } : {}),
    }));
}

// Завершение чата из-за превышения лимита отключений
async function endChatDueToMaxDisconnects(io, chat, disconnectedUserId, waitingUserId) {
    await closeChatAfterDisconnect(io, chat, {
        disconnectedUserId,
        waitingUserId,
        reason: 'max_disconnects',
        applyStrictWarning: true,
    });
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
    const participants = Array.isArray(chat.participants) ? chat.participants.map((value) => String(value)) : [];
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

    return chatService.touchChatActivity(chat._id, {
        participantLanguages,
        isFriendSnapshot,
        startedAt: chat.startedAt ? new Date(chat.startedAt).toISOString() : new Date().toISOString(),
        lastActivityAt: state?.lastActivityAt || (chat.startedAt ? new Date(chat.startedAt).toISOString() : new Date().toISOString()),
    });
}

function setActiveChatContext(chatId, context = {}) {
    const id = toId(chatId);
    if (!id) return null;
    const participants = Array.isArray(context.participants)
        ? context.participants.map((value) => String(value)).filter(Boolean)
        : [];
    const participantLanguages = context.participantLanguages && typeof context.participantLanguages === 'object'
        ? context.participantLanguages
        : {};
    const next = {
        participants,
        participantLanguages,
        startedAt: context.startedAt || null,
        status: context.status || 'active',
        isFriend: typeof context.isFriend === 'boolean' ? context.isFriend : null,
        readyAt: context.readyAt || null,
        isPreparing: Boolean(context.isPreparing),
    };
    activeChatContexts.set(String(id), next);
    return next;
}

function clearActiveChatContext(chatId) {
    const id = toId(chatId);
    if (!id) return;
    activeChatContexts.delete(String(id));
}

function getChatPreparationState(chatLike) {
    const startedAtMs = chatLike?.startedAt ? new Date(chatLike.startedAt).getTime() : 0;
    const futureStartedAt = Number.isFinite(startedAtMs) && startedAtMs > Date.now()
        ? new Date(startedAtMs).toISOString()
        : null;
    const readyAtValue = chatLike?.preparationState?.readyAt || chatLike?.readyAt || futureStartedAt || null;
    const readyAtMs = readyAtValue ? new Date(readyAtValue).getTime() : 0;
    const isPreparingByTime = Number.isFinite(readyAtMs) && readyAtMs > Date.now();
    const isPreparingFlag = typeof chatLike?.preparationState?.isPreparing === 'boolean'
        ? chatLike.preparationState.isPreparing
        : Boolean(chatLike?.isPreparing);

    return {
        readyAt: readyAtValue,
        readyAtMs: Number.isFinite(readyAtMs) ? readyAtMs : 0,
        isPreparing: isPreparingFlag || isPreparingByTime,
        countdownSeconds: Math.max(0, Math.ceil(((Number.isFinite(readyAtMs) ? readyAtMs : Date.now()) - Date.now()) / 1000)),
    };
}

async function primeActiveChatContext(chat) {
    if (!chat?._id) return null;
    const chatId = String(chat._id);
    const existing = activeChatContexts.get(chatId);
    const participants = Array.isArray(chat.participants) ? chat.participants.map((value) => String(value)).filter(Boolean) : [];
    const hasExistingLanguages = existing?.participantLanguages
        && participants.every((id) => existing.participantLanguages[String(id)]);
    if (existing && hasExistingLanguages) {
        return existing;
    }

    const state = await ensureChatTranscriptMetadata(chat);
    const preparation = getChatPreparationState(chat);
    return setActiveChatContext(chatId, {
        participants,
        participantLanguages: state?.participantLanguages || {},
        startedAt: chat.startedAt ? new Date(chat.startedAt).toISOString() : new Date().toISOString(),
        status: chat.status || 'active',
        isFriend: typeof state?.isFriendSnapshot === 'boolean' ? state.isFriendSnapshot : null,
        readyAt: preparation.readyAt || null,
        isPreparing: preparation.isPreparing,
    });
}

async function getChatFriendSnapshot(chat) {
    if (!chat?._id) return false;
    const context = await primeActiveChatContext(chat);
    if (typeof context?.isFriend === 'boolean') {
        return context.isFriend;
    }

    const participants = Array.isArray(chat.participants) ? chat.participants.map((value) => String(value)).filter(Boolean) : [];
    const isFriend = participants.length >= 2
        ? await friendService.areUsersFriends(participants[0], participants[1]).catch(() => false)
        : false;

    const preparation = getChatPreparationState(chat);
    setActiveChatContext(chat._id, {
        ...(context || {}),
        participants: participants.length ? participants : context?.participants || [],
        participantLanguages: context?.participantLanguages || {},
        startedAt: context?.startedAt || (chat.startedAt ? new Date(chat.startedAt).toISOString() : null),
        status: chat.status || context?.status || 'active',
        isFriend,
        readyAt: preparation.readyAt || context?.readyAt || null,
        isPreparing: preparation.isPreparing || Boolean(context?.isPreparing),
    });

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

function getChatIdleDeadline(chatState, chat) {
    const startedAtMs = chat?.startedAt ? new Date(chat.startedAt).getTime() : Date.now();
    const lastActivityMs = chatState?.lastActivityAt ? new Date(chatState.lastActivityAt).getTime() : startedAtMs;
    if (!Number.isFinite(lastActivityMs)) return null;
    return lastActivityMs + CHAT_IDLE_TIMEOUT_MS;
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
    const safeDurationSeconds = durationSeconds == null
        ? computeDurationSeconds({
            startedAt: chat.startedAt || new Date(),
            endedAt: endDate,
            reportedTotalDurationSeconds,
        })
        : Math.max(0, Math.floor(Number(durationSeconds) || 0));

    await updateChatById(chat._id, {
        status,
        ended_at: endDate.toISOString(),
        duration: safeDurationSeconds,
        waiting_state: null,
        ...chatPatch,
    });
    if (chatPreparationTimeouts.has(String(chat._id))) {
        clearTimeout(chatPreparationTimeouts.get(String(chat._id)));
        chatPreparationTimeouts.delete(String(chat._id));
    }
    clearActiveChatContext(chat._id);

    const participants = Array.isArray(chat.participants) ? chat.participants.map((value) => String(value)).filter(Boolean) : [];
    participants.forEach((userId) => userActiveChat.delete(String(userId)));
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

    return {
        durationSeconds: safeDurationSeconds,
        participants,
        isFriends: Boolean(persistTranscript),
        durationMinutes: Math.max(1, Math.round(safeDurationSeconds / 60)),
    };
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

async function registerStrictDisconnectWarning(userOrId, chatId, io) {
    try {
        const userId = toId(userOrId);
        if (!userId) return { warningCount30Days: 0, lifeDeducted: false };
        const windowStart = new Date(Date.now() - CONNECTION_WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const row = await getUserRowById(userId);
        if (!row) return { warningCount30Days: 0, lifeDeducted: false };
        const data = getUserData(row);

        const existingWarnings = Array.isArray(data.connectionWarnings) ? data.connectionWarnings : [];
        const nextWarnings = existingWarnings
            .filter((w) => {
                const at = w?.warnedAt ? new Date(w.warnedAt) : null;
                if (!at || Number.isNaN(at.getTime())) return false;
                return at >= windowStart;
            })
            .concat([{ warnedAt: new Date().toISOString(), chatId }]);

        const warningCount30Days = nextWarnings.length;
        const currentLives = Number(data.lives) || 0;
        const shouldDeductLife = warningCount30Days >= 2 && currentLives > 0;

        const patch = {
            connectionWarnings: nextWarnings,
            warningCount30Days,
        };

        if (shouldDeductLife) {
            patch.lives = currentLives - 1;
        }

        const saved = await updateUserDataById(userId, patch);
        const { createNotification } = require('../controllers/notificationController');

        const email = String(saved?.email || row?.email || '').trim();
        const nickname = String(saved?.nickname || row?.nickname || '').trim();
        const userLang = (saved?.language || saved?.data?.language || row?.language || row?.data?.language || 'ru') === 'en' ? 'en' : 'ru';

        if (shouldDeductLife && email) {
            await emailService.sendUnstableConnectionPenaltyEmail(
                email,
                nickname,
                userLang
            ).catch(() => { });
        }

        await createNotification({
            userId,
            type: 'chat_warning',
            title: shouldDeductLife
                ? (userLang === 'en' ? '1 life removed' : 'Снята 1 жизнь')
                : (userLang === 'en' ? 'Chat warning' : 'Предупреждение по чату'),
            message: shouldDeductLife
                ? (userLang === 'en'
                    ? 'For the second time in the last 30 days, you did not return to the chat during the mandatory first 5 minutes. According to the chat rules, 1 life has been deducted.'
                    : 'Вы второй раз за последние 30 дней не вернулись в чат в обязательные первые 5 минут. По правилам чата у вас была вычтена 1 жизнь.')
                : (userLang === 'en'
                    ? 'You left the chat and did not wait for the mandatory 5-minute timer. This is your first time, so your lives were kept, but next time 1 life will be deducted.'
                    : 'Вы покинули чат и не дождались обязательного 5-минутного таймера. У вас это впервые, поэтому жизни сохранены, но в следующий раз будет снята 1 жизнь.'),
            link: '/cabinet/history',
            eventKey: `chat_disconnect_warning:${chatId}:${warningCount30Days}`,
            io,
        });

        return {
            warningCount30Days,
            lifeDeducted: shouldDeductLife,
        };
    } catch (error) {
        console.error('Error in registerStrictDisconnectWarning:', error);
        return { warningCount30Days: 0, lifeDeducted: false };
    }
}

async function addToQueue(userId, socketId) {
    const userKey = normalizeUserId(userId);
    if (!userKey || await getQueuedUser(userKey)) return false;

    return addSharedToQueue({
        userId: userKey,
        socketId,
        startedAt: Date.now()
    });
}

function scheduleCallTimeout(io, targetId, initiatorId, callToken) {
    const targetKey = normalizeUserId(targetId);
    const initiatorKey = normalizeUserId(initiatorId);
    clearPendingCallTimeout(targetKey);
    const timeoutId = setTimeout(() => {
        void (async () => {
            const pendingCall = await getPendingCallRecord(targetKey);
            if (!pendingCall) return;
            if (pendingCall.initiatorId !== initiatorKey) return;
            if (String(pendingCall.token || '') !== String(callToken || '')) return;

            await clearPendingCall(targetKey);
            clearCurrentCallForInitiator(initiatorKey, targetKey, callToken);
            io.to(getUserRoomName(targetKey)).emit('call_timeout');
            io.to(getUserRoomName(initiatorKey)).emit('call_timeout');
            await continueSearch(io, initiatorKey);
        })().catch(() => { });
    }, SEARCH_CALL_TIMEOUT_MS);
    pendingCallTimeouts.set(targetKey, { timeoutId, initiatorId: initiatorKey, token: String(callToken || '') });
}

async function tryStartDirectMatch(io, initiatorId) {
    const initiatorKey = normalizeUserId(initiatorId);
    const initiatorSession = getSearchSession(initiatorKey);
    if (!initiatorSession || initiatorSession.currentTargetId) return false;

    const directCandidates = await matchingService.findMatchCandidates(initiatorKey, {
        onlySearching: true,
        requireMutual: true,
    });

    for (const candidate of directCandidates) {
        const targetId = normalizeUserId(candidate?._id);
        if (!targetId || targetId === initiatorKey) continue;

        const targetSession = getSearchSession(targetId);
        if (!targetSession || targetSession.currentTargetId) continue;
        if (!(await getQueuedUser(targetId))) continue;
        if (await hasPendingCall(initiatorKey) || await hasPendingCall(targetId)) continue;

        const lockKey = acquireSearchPairLock(initiatorKey, targetId);
        if (!lockKey) continue;

        try {
            const freshInitiatorSession = getSearchSession(initiatorKey);
            const freshTargetSession = getSearchSession(targetId);
            if (!freshInitiatorSession || !freshTargetSession) continue;
            if (freshInitiatorSession.currentTargetId || freshTargetSession.currentTargetId) continue;

            const initiatorProfile = matchingService.getOnlineProfile(initiatorKey);
            const targetProfile = matchingService.getOnlineProfile(targetId);
            if (!matchingService.areProfilesMutuallyCompatible(initiatorProfile, targetProfile)) continue;

            await startChat(io, initiatorKey, targetId);
            return true;
        } finally {
            releaseSearchPairLock(lockKey);
        }
    }

    return false;
}

async function continueSearch(io, initiatorId) {
    const initiatorKey = normalizeUserId(initiatorId);
    const session = getSearchSession(initiatorKey);
    if (!session) return false;
    if (userActiveChat.has(initiatorKey)) return false;
    if (!(await getQueuedUser(initiatorKey))) {
        clearSearchSession(initiatorKey);
        return false;
    }
    if (await hasPendingCall(initiatorKey)) return true;
    if (session.currentTargetId) return true;

    if (await tryStartDirectMatch(io, initiatorKey)) {
        return true;
    }

    while (true) {
        const freshSession = getSearchSession(initiatorKey);
        if (!freshSession) return false;

        if (!Array.isArray(freshSession.candidateIds) || freshSession.candidateIndex >= freshSession.candidateIds.length) {
            const nextRound = Number(freshSession.round || 0) + 1;
            if (nextRound > SEARCH_MAX_ROUNDS) {
                const currentSession = getSearchSession(initiatorKey);
                if (!currentSession || userActiveChat.has(initiatorKey) || !(await getQueuedUser(initiatorKey))) {
                    return false;
                }
                await removeFromQueue(initiatorKey);
                io.to(getUserRoomName(initiatorKey)).emit('no_partner');
                return false;
            }

            const nextCandidates = await matchingService.findMatchCandidates(initiatorKey);
            if (!nextCandidates.length) {
                const currentSession = getSearchSession(initiatorKey);
                if (!currentSession || userActiveChat.has(initiatorKey) || !(await getQueuedUser(initiatorKey))) {
                    return false;
                }
                await removeFromQueue(initiatorKey);
                io.to(getUserRoomName(initiatorKey)).emit('no_partner');
                return false;
            }

            setSearchSession({
                ...freshSession,
                round: nextRound,
                candidateIds: nextCandidates.map((candidate) => normalizeUserId(candidate?._id)).filter(Boolean),
                candidateIndex: 0,
            });

            if (await tryStartDirectMatch(io, initiatorKey)) {
                return true;
            }
            continue;
        }

        const targetId = normalizeUserId(freshSession.candidateIds[freshSession.candidateIndex]);
        updateSearchSession(initiatorKey, {
            candidateIndex: freshSession.candidateIndex + 1,
        });

        if (userActiveChat.has(initiatorKey)) return false;
        if (!targetId || targetId === initiatorKey) continue;
        if (!(await hasUserRoom(io, targetId))) continue;
        if (await hasPendingCall(initiatorKey) || await hasPendingCall(targetId)) continue;

        const targetProfile = matchingService.getOnlineProfile(targetId);
        if (!targetProfile || targetProfile.chatStatus !== 'available') continue;

        if (targetProfile.isSearching) {
            if (await tryStartDirectMatch(io, initiatorKey)) {
                return true;
            }
            continue;
        }

        const callToken = `${initiatorKey}:${targetId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        const pendingSet = await setPendingCall(targetId, initiatorKey, SEARCH_CALL_TIMEOUT_MS, callToken);
        if (!pendingSet) continue;

        updateSearchSession(initiatorKey, {
            currentTargetId: targetId,
            currentCallToken: callToken,
        });

        io.to(getUserRoomName(targetId)).emit('incoming_call', { callerId: initiatorKey });
        io.to(getUserRoomName(initiatorKey)).emit('calling_partner');
        scheduleCallTimeout(io, targetId, initiatorKey, callToken);
        return true;
    }
}

async function startPartnerSearch(io, userId, socketId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return false;

    if (getSearchSession(userKey)) {
        return true;
    }
    if (await hasPendingCall(userKey)) {
        return true;
    }

    const added = await addToQueue(userKey, socketId);
    if (!added && !(await getQueuedUser(userKey))) {
        return false;
    }

    const startedAt = Date.now();
    setSearchSession({
        userId: userKey,
        socketId,
        round: 0,
        candidateIds: [],
        candidateIndex: 0,
        currentTargetId: null,
        currentCallToken: '',
        startedAt,
    });
    matchingService.updateOnlineUser(userKey, {
        isSearching: true,
        searchStartedAt: startedAt,
        chatStatus: 'available',
    });

    io.to(getUserRoomName(userKey)).emit('searching');
    return continueSearch(io, userKey);
}

function initSocketService(io) {
    io.on('connection', (socket) => {
        // Identify user (simplified, in real app use middleware)
        // Client should emit 'auth' or similar, or we use handshake query
        let currentUserId = null;

        socket.on('auth', async (payload = {}) => {
            try {
                socket.data.siteLanguage = normalizeRequestLanguage(payload?.siteLanguage || socket.data.siteLanguage);
                const userId = socket.data.userId || null;
                if (!userId) {
                    socket.emit('auth:error', buildSocketMessage(socket, 'auth.authorization_required', 'Требуется авторизация', 'Authorization required'));
                    socket.disconnect();
                    return;
                }
                const userKey = normalizeUserId(userId);
                const hadLiveSocketBeforeJoin = await hasUserRoom(io, userKey);
                currentUserId = userKey;
                await socket.join(getUserRoomName(userKey));
                onlineUsers.add(userKey);

                const currentUserRow = await getUserRowById(userKey);
                if (currentUserRow) {
                    matchingService.registerOnlineUser(userKey, currentUserRow);
                }

                if (!hadLiveSocketBeforeJoin) {
                    await touchUserTimestamp(userKey, 'lastOnlineAt');
                }

                const activeChat = await findActiveChatByParticipant(userKey);

                if (!activeChat) {
                    userActiveChat.delete(userKey);
                    await setUsersChatStatus(userKey, 'available');
                    return;
                }

                userActiveChat.set(userKey, String(activeChat._id));
                await setUsersChatStatus(userKey, 'in_chat');
                await primeActiveChatContext(activeChat);

                if (activeChat.waitingState?.isWaiting) {
                    const disconnectedId = activeChat.waitingState.disconnectedUserId?.toString();
                    if (disconnectedId === userKey) {
                        await handlePartnerReconnected(io, activeChat._id, userKey);
                    } else {
                        const waitingSinceMs = new Date(activeChat.waitingState.waitingSince).getTime();
                        const elapsed = Math.floor((Date.now() - waitingSinceMs) / 1000);
                        const timeLeft = Math.max(0, 60 - elapsed);
                        const activeElapsedSeconds = Math.max(0, Math.floor(
                            Number(activeChat.waitingState?.activeElapsedSeconds)
                            || getActiveChatDurationSeconds(activeChat, { endedAt: new Date(waitingSinceMs) })
                        ));
                        const disconnectionCount = activeChat.disconnectionCount && typeof activeChat.disconnectionCount === 'object'
                            ? activeChat.disconnectionCount
                            : {};
                        const disconnectCount = disconnectedId ? (Number(disconnectionCount[String(disconnectedId)]) || 0) : 0;

                        io.to(getUserRoomName(userKey)).emit('partner_disconnected', buildSocketMessageKey(
                            activeChat.waitingState?.mode === 'soft'
                                ? 'chat.partner_connection_lost_soft'
                                : 'chat.partner_connection_lost_wait',
                            {
                            chatId: activeChat._id,
                            disconnectCount,
                            maxDisconnects: activeChat.waitingState?.mode === 'soft' ? 0 : MAX_DISCONNECTS_PER_CHAT,
                            timeLeft: activeChat.waitingState?.mode === 'soft' ? 0 : timeLeft,
                            activeElapsedSeconds,
                            strictMode: activeChat.waitingState?.mode !== 'soft',
                        }));
                    }
                }
            } catch (error) {
                console.error('Error in auth handler:', error);
            }
        });

        socket.on('site_language', ({ language } = {}) => {
            socket.data.siteLanguage = normalizeRequestLanguage(language || socket.data.siteLanguage);
        });

        const handleSocketDisconnect = async () => {
            if (!currentUserId) return;

            try {
                if (await hasUserRoom(io, currentUserId)) {
                    return;
                }

                onlineUsers.delete(currentUserId);
                matchingService.unregisterOnlineUser(currentUserId);
                await touchUserTimestamp(currentUserId, 'lastSeenAt');

                await removeFromQueue(currentUserId);
                await clearPendingCallsForUser(currentUserId);

                const activeChatId = userActiveChat.get(currentUserId);
                const chat = activeChatId
                    ? await getChatById(activeChatId)
                    : await findActiveChatByParticipant(currentUserId);

                if (!chat || chat.status !== 'active') {
                    userActiveChat.delete(currentUserId);
                    return;
                }

                userActiveChat.set(currentUserId, String(chat._id));

                if (chat.waitingState?.isWaiting) return;

                const partnerId = chat.participants.find(p => p.toString() !== currentUserId);
                if (partnerId) {
                    await startWaitingForReconnect(io, chat._id, currentUserId, partnerId);
                }
            } catch (error) {
                console.error('Error on disconnect handler:', error);
            }
        };

        socket.on('disconnect', () => {
            void handleSocketDisconnect();
        });

        // Update User Status (available/busy)
        socket.on('update_status', async ({ status } = {}) => {
            if (!currentUserId) return;
            await setUsersChatStatus(currentUserId, status);
        });

        // Join Chat Room only for the authenticated chat participant
        socket.on('chat:join', async ({ chatId } = {}) => {
            const authenticatedUserId = currentUserId || socket.data.userId || null;
            if (!chatId || !authenticatedUserId) return;

            try {
                const chat = await getChatById(chatId);
                if (!chat) {
                    socket.emit('chat_ended', { reason: 'not_found' });
                    return;
                }
                if (!(chat.participants || []).map(String).includes(String(authenticatedUserId))) {
                    socket.emit('chat_ended', { reason: 'not_found' });
                    return;
                }
                if (chat.status !== 'active') {
                    socket.emit('chat_ended', { reason: chat.status });
                    return;
                }

                socket.join(`${CHAT_ROOM_PREFIX}${chatId}`);
                const chatContext = await primeActiveChatContext(chat);
                const preparation = getChatPreparationState(chatContext || chat);
                if (preparation.isPreparing) {
                    socket.emit('chat_preparing', {
                        chatId: String(chatId),
                        countdownSeconds: preparation.countdownSeconds,
                        readyAt: preparation.readyAt,
                    });
                }
                if (chat.waitingState?.isWaiting) {
                    const waitingSinceMs = new Date(chat.waitingState.waitingSince).getTime();
                    const elapsed = Math.floor((Date.now() - waitingSinceMs) / 1000);
                    const timeLeft = Math.max(0, 60 - elapsed);
                    const activeElapsedSeconds = Math.max(0, Math.floor(
                        Number(chat.waitingState?.activeElapsedSeconds)
                        || getActiveChatDurationSeconds(chat, { endedAt: new Date(waitingSinceMs) })
                    ));
                    const disconnectedId = chat.waitingState?.disconnectedUserId ? String(chat.waitingState.disconnectedUserId) : '';
                    const disconnectionCount = chat.disconnectionCount && typeof chat.disconnectionCount === 'object'
                        ? chat.disconnectionCount
                        : {};
                    const disconnectCount = disconnectedId ? (Number(disconnectionCount[disconnectedId]) || 0) : 0;

                    socket.emit('partner_disconnected', buildSocketMessage(
                        socket,
                        chat.waitingState?.mode === 'soft'
                            ? 'chat.partner_connection_lost_soft'
                            : 'chat.partner_connection_lost_wait',
                        'У вашего собеседника пропала связь. Подождите его возвращения...',
                        'Your chat partner lost connection. Please wait for them to return...',
                        {
                        chatId: chat._id,
                        disconnectCount,
                        maxDisconnects: chat.waitingState?.mode === 'soft' ? 0 : MAX_DISCONNECTS_PER_CHAT,
                        timeLeft: chat.waitingState?.mode === 'soft' ? 0 : timeLeft,
                        activeElapsedSeconds,
                        strictMode: chat.waitingState?.mode !== 'soft',
                    }));
                }
            } catch (error) {
                console.error('Error in chat:join:', error);
            }
        });

        // Find Partner
        socket.on('find_partner', async () => {
            if (!currentUserId) return;

            try {
                await startPartnerSearch(io, currentUserId, socket.id);
            } catch (error) {
                console.error('Error finding partner:', error);
                socket.emit('error', { message: 'Error finding partner' });
            }
        });

        // Call Response
        socket.on('call_response', async ({ accepted, callerId }) => {
            if (!currentUserId) return;

            // Verify pending call
            const initiatorId = await getPendingCall(currentUserId);
            if (initiatorId !== callerId) {
                // Call might have timed out or invalid
                return;
            }

            await clearPendingCall(currentUserId);
            clearCurrentCallForInitiator(initiatorId, currentUserId);

            if (accepted) {
                // Start chat!
                await startChat(io, initiatorId, currentUserId);
            } else {
                // Declined
                // 1. Set cooldown for decliner (currentUserId)
                matchingService.setCooldown(currentUserId, 30);

                // 2. Notify initiator (caller) that call was declined
                io.to(`user-${initiatorId}`).emit('call_declined');
                // 3. Immediately продолжить поиск для инициатора
                await continueSearch(io, initiatorId);
                if (getSearchSession(currentUserId)) {
                    await continueSearch(io, currentUserId);
                }
            }
        });

        // Cancel Search
        socket.on('cancel_search', async () => {
            await removeFromQueue(currentUserId);
            await clearPendingCallsForUser(currentUserId);
        });

        // Send Message
        socket.on('send_message', async ({ chatId, text }) => {
            try {
                let chatContext = activeChatContexts.get(String(chatId));
                let chat = null;

                if (!chatContext || !Array.isArray(chatContext.participants) || !chatContext.participants.includes(String(currentUserId))) {
                    chat = await getChatById(chatId);
                    if (!chat || chat.status !== 'active') return;
                    if (chat.waitingState?.isWaiting) return;
                    chatContext = await primeActiveChatContext(chat);
                }

                if (!chatContext || !Array.isArray(chatContext.participants) || !chatContext.participants.includes(String(currentUserId))) {
                    return;
                }

                const preparation = getChatPreparationState(chatContext);
                if (preparation.isPreparing) {
                    socket.emit('chat_preparing', {
                        chatId: String(chatId),
                        countdownSeconds: preparation.countdownSeconds,
                        readyAt: preparation.readyAt,
                    });
                    return;
                }

                const participantLanguages = chatContext.participantLanguages || {};
                const partnerId = chatContext.participants.find((participantId) => String(participantId) !== String(currentUserId));
                const targetLang = participantLanguages[String(partnerId)] || 'ru';
                const sourceLang = participantLanguages[String(currentUserId)] || 'ru';

                const message = await chatService.createMessage({
                    chatId,
                    senderId: currentUserId,
                    content: text,
                    language: sourceLang,
                    targetLanguage: targetLang,
                    chatContext,
                });

                // Emit to room
                io.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('new_message', {
                    _id: message._id,
                    senderId: currentUserId,
                    originalText: message.originalText,
                    translatedText: message.translatedText,
                    createdAt: message.createdAt
                });

            } catch (error) {
                console.error('Error sending message:', error);
            }
        });

        // Typing indicator
        socket.on('typing', ({ chatId }) => {
            const chatContext = activeChatContexts.get(String(chatId));
            if (getChatPreparationState(chatContext).isPreparing) return;
            socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_typing');
        });

        socket.on('stop_typing', ({ chatId }) => {
            const chatContext = activeChatContexts.get(String(chatId));
            if (getChatPreparationState(chatContext).isPreparing) return;
            socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_stop_typing');
        });

        socket.on('chat_heartbeat', async ({ chatId }) => {
            try {
                const chatContext = activeChatContexts.get(String(chatId));
                if (!chatContext || !Array.isArray(chatContext.participants) || !chatContext.participants.includes(String(currentUserId))) return;
                if (getChatPreparationState(chatContext).isPreparing) return;
                await chatService.touchChatActivity(chatId, {
                    lastHeartbeatUserId: String(currentUserId),
                    heartbeatIntervalMs: CHAT_IDLE_HEARTBEAT_INTERVAL_MS,
                });
            } catch (error) {
                console.error('Error handling chat heartbeat:', error);
            }
        });

        // Leave Chat
        socket.on('leave_chat', async ({ chatId, reportedTotalDurationSeconds }) => {
            try {
                const chat = await getChatById(chatId);
                if (!chat || chat.status !== 'active') return;

                const now = Date.now();
                const partnerId = chat.participants.find(p => p.toString() !== currentUserId);
                const isFriends = await getChatFriendSnapshot(chat);

                if (chat.waitingState?.isWaiting) {
                    const isStrictWaiting = chat.waitingState?.mode !== 'soft';
                    const duration = getActiveChatDurationSeconds(chat, {
                        endedAt: new Date(now),
                        reportedTotalDurationSeconds,
                    });

                    if (chatWaitingTimeouts.has(chatId)) {
                        clearTimeout(chatWaitingTimeouts.get(chatId));
                        chatWaitingTimeouts.delete(chatId);
                    }

                    if (!isFriends && isStrictWaiting) {
                        const row = await getUserRowById(currentUserId);
                        const data = getUserData(row);
                        const lives = Math.max(0, (Number(data.lives) || 0) - 1);
                        await updateUserDataById(currentUserId, { lives });
                    }

                    await finalizeCompletedChat(io, chat, {
                        endedAt: new Date(now),
                        durationSeconds: duration,
                        persistTranscript: isFriends,
                        leftEarlyUserId: currentUserId,
                        chatEndedPayload: {
                            reason: 'left_waiting',
                            duration,
                            lifeDeducted: !isFriends && isStrictWaiting,
                        },
                        emitRatePrompt: true,
                    });
                    return;
                }

                const duration = getActiveChatDurationSeconds(chat, {
                    endedAt: new Date(now),
                    reportedTotalDurationSeconds,
                });

                // If < 5 mins (300 seconds), penalty
                if (duration < 300 && !isFriends) {
                    const row = await getUserRowById(currentUserId);
                    const data = getUserData(row);
                    const lives = Math.max(0, (Number(data.lives) || 0) - 1);
                    await updateUserDataById(currentUserId, { lives });
                    // Notify partner
                    socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_left_early');
                }

                await finalizeCompletedChat(io, chat, {
                    endedAt: new Date(now),
                    durationSeconds: duration,
                    persistTranscript: isFriends,
                    leftEarlyUserId: currentUserId,
                    emitRatePrompt: true,
                });

            } catch (error) {
                console.error('Error leaving chat:', error);
            }
        });

        // Подтверждение выхода из чата во время ожидания
        socket.on('confirm_leave_waiting', async ({ chatId }) => {
            try {
                const chat = await getChatById(chatId);
                if (!chat || chat.status !== 'active' || !chat.waitingState?.isWaiting) return;
                const partnerId = chat.participants.find(p => p.toString() !== currentUserId);
                const isFriends = await getChatFriendSnapshot(chat);
                const isStrictWaiting = chat.waitingState?.mode !== 'soft';

                // Вычитаем жизнь тому, кто ушел во время ожидания
                if (!isFriends && isStrictWaiting) {
                    const row = await getUserRowById(currentUserId);
                    const data = getUserData(row);
                    const lives = Math.max(0, (Number(data.lives) || 0) - 1);
                    await updateUserDataById(currentUserId, { lives });
                }

                if (chatWaitingTimeouts.has(chatId)) {
                    clearTimeout(chatWaitingTimeouts.get(chatId));
                    chatWaitingTimeouts.delete(chatId);
                }

                const duration = getActiveChatDurationSeconds(chat, { endedAt: new Date() });

                await finalizeCompletedChat(io, chat, {
                    endedAt: new Date(),
                    durationSeconds: duration,
                    persistTranscript: isFriends,
                    leftEarlyUserId: currentUserId,
                    chatEndedPayload: {
                        reason: 'left_waiting',
                        duration,
                        lifeDeducted: !isFriends && isStrictWaiting,
                    },
                    emitRatePrompt: true,
                });

            } catch (error) {
                console.error('Error confirming leave waiting:', error);
            }
        });

        // Add Friend (request only; acceptance happens in cabinet)
        socket.on('add_friend', async ({ oderId, otherId, friendId }) => {
            try {
                const targetId = (friendId || otherId || oderId || '').toString();
                if (!currentUserId || !targetId || targetId === currentUserId.toString()) return;

                const result = await friendService.sendFriendRequestOrAutoAccept({
                    fromUserId: currentUserId,
                    toUserId: targetId,
                });

                if (result.status === 'request_sent') {
                    try {
                        const { createNotification } = require('../controllers/notificationController');
                        const senderRow = await getUserRowById(currentUserId);
                        const targetRow = await getUserRowById(targetId);
                        const senderNick = String(senderRow?.nickname || getUserData(senderRow).nickname || '').trim();
                        const targetLang = (targetRow?.language || targetRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
                        await createNotification({
                            userId: targetId,
                            type: 'friend_request',
                            title: targetLang === 'en' ? 'New friend request' : 'Новая заявка в друзья',
                            message: targetLang === 'en'
                                ? `${senderNick || 'User'} wants to add you as a friend`
                                : `${senderNick || 'Пользователь'} хочет добавить вас в друзья`,
                            link: '/cabinet/friends',
                            io,
                        });
                    } catch (_e) {
                        // ignore notification failures
                    }

                    socket.emit('friend_request_sent', { friendId: targetId });
                    emitFriendsUpdated(io, [currentUserId, targetId]);
                    return;
                }

                if (result.status === 'already_requested') {
                    socket.emit('friend_request_pending', { friendId: targetId });
                    return;
                }

                if (result.status === 'pending_acceptance') {
                    socket.emit('friend_request_pending', buildSocketMessage(
                        socket,
                        'chat.friend_request_pending_hint',
                        'Заявка уже ждёт принятия в ЛК',
                        'The request is already waiting in Profile',
                        {
                        friendId: targetId,
                        }
                    ));
                    return;
                }

                if (result.status === 'already_friends') {
                    socket.emit('friend_added', { friendId: targetId });
                    io.to(`user-${targetId}`).emit('friend_added', { friendId: currentUserId });
                    emitFriendsUpdated(io, [currentUserId, targetId]);
                }
            } catch (error) {
                console.error('Error adding friend:', error);
            }
        });

        // Rate Partner
        socket.on('rate_partner', async ({ chatId, rating }) => {
            try {
                const chat = await getChatById(chatId);
                if (!chat) return;

                if (!(chat.participants || []).map(String).includes(String(currentUserId))) return;

                // Find partner
                const partnerId = chat.participants.find(p => p.toString() !== currentUserId);
                if (!partnerId) return;

                const alreadyRated = Array.isArray(chat.ratings) && chat.ratings.some((r) => String(r?.from || '') === String(currentUserId));
                if (alreadyRated) {
                    socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_rated');
                    return;
                }

                // Сияние за оценку общения: понравилось=2, не понравилось=1 (только при травме)
                try {
                    const radianceAmount = rating ? 2 : 1;
                    await awardRadianceForActivity({
                        userId: currentUserId,
                        amount: radianceAmount,
                        activityType: 'chat_rate',
                        meta: { chatId, rating: Boolean(rating) },
                        dedupeKey: `chat_rate:${chatId}:${currentUserId}`,
                    });
                } catch (e) {
                    // ignore
                }

                // Save rating
                const nextRatings = (Array.isArray(chat.ratings) ? chat.ratings : []).concat([
                    {
                        from: String(currentUserId),
                        to: String(partnerId),
                        rating: Boolean(rating),
                    }
                ]);
                await updateChatById(chatId, { ratings: nextRatings });

                if (rating) {
                    const { applyStarsDelta } = require('../utils/stars');
                    await applyStarsDelta({
                        userId: partnerId,
                        delta: 0.001,
                        type: 'chat_rating',
                        description: 'Оценка общения',
                        relatedEntity: chatId,
                    });

                    // Ачивки за лайки
                    try {
                        const { grantAchievement } = require('./achievementService');
                        const partnerRow = await getUserRowById(partnerId);
                        const partnerData = getUserData(partnerRow);
                        const partnerStats = partnerData.achievementStats && typeof partnerData.achievementStats === 'object' ? partnerData.achievementStats : {};
                        const likes = (Number(partnerStats.totalPositiveRatingsReceived) || 0) + 1;
                        const nextPartnerStats = { ...partnerStats, totalPositiveRatingsReceived: likes };
                        await updateUserDataById(partnerId, { achievementStats: nextPartnerStats });

                        if (likes >= 50) {
                            await grantAchievement({ userId: partnerId, achievementId: 76 });
                        }
                        if (likes >= 100) {
                            await grantAchievement({ userId: partnerId, achievementId: 93 });
                        }
                    } catch (err) {
                        console.error('Error updating chat like achievements:', err);
                    }

                    const kService = require('./kService');
                    await kService.creditK({
                        userId: currentUserId,
                        amount: 5,
                        type: 'chat_rating',
                        description: 'Награда за оценку собеседника',
                        relatedEntity: chatId
                    });
                }

                // Уведомляем партнёра что мы закончили с оценкой
                socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_rated');

            } catch (error) {
                console.error('Error rating partner:', error);
            }
        });

        // Friend Direct Invite
        socket.on('invite_friend', async ({ friendId }) => {
            try {
                if (!currentUserId || !friendId) return;
                const isFriends = await friendService.areUsersFriends(currentUserId, friendId);
                if (!isFriends) {
                    socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_only_for_friends', 'Пользователь не находится у вас в друзьях', 'This user is not in your friends list'));
                    return;
                }

                // Check if friend is online
                const friendRoom = io.sockets.adapter.rooms.get(`user-${friendId}`);
                const isOnline = friendRoom && friendRoom.size > 0;

                if (!isOnline) {
                    socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_friend_offline', 'Пользователь не в сети', 'The user is offline'));
                    return;
                }

                // Check if friend is busy (simplified: checking pendingCalls or status)
                // Better: check User.chatStatus
                const friendRow = await getUserRowById(friendId);
                const friendData = getUserData(friendRow);
                if ((friendData.chatStatus || 'available') !== 'available') {
                    socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_friend_busy', 'Пользователь сейчас занят', 'The user is busy right now'));
                    return;
                }

                // Send invite (same incoming call envelope for random/friend UX on frontend)
                const inviterRow = await getUserRowById(currentUserId);
                const inviterName = String(inviterRow?.nickname || getUserData(inviterRow).nickname || '').trim() || 'Друг';
                io.to(`user-${friendId}`).emit('incoming_call', {
                    callerId: currentUserId,
                    source: 'friend',
                    callerName: inviterName,
                });
                // Backward compatibility for existing listeners
                io.to(`user-${friendId}`).emit('friend_invite', {
                    inviterId: currentUserId,
                    inviterName,
                });

                socket.emit('invite_sent', buildSocketMessage(socket, 'friends.invite_sent', 'Приглашение отправлено', 'Invite sent'));

            } catch (error) {
                console.error('Error inviting friend:', error);
                socket.emit('invite_error', buildSocketMessage(socket, 'friends.invite_error', 'Ошибка при приглашении', 'Failed to send invite'));
            }
        });

        // Friend Invite Response
        socket.on('friend_invite_response', async ({ inviterId, accepted }) => {
            try {
                if (!currentUserId) return;

                if (accepted) {
                    const isFriends = await friendService.areUsersFriends(inviterId, currentUserId);
                    if (!isFriends) {
                        io.to(`user-${currentUserId}`).emit('invite_error', buildSocketMessageKey('friends.invite_outdated'));
                        return;
                    }
                    const inviterRow = await getUserRowById(inviterId);
                    const inviterData = getUserData(inviterRow);
                    if (!inviterRow || (inviterData.chatStatus || 'available') !== 'available') {
                        io.to(`user-${currentUserId}`).emit('invite_error', buildSocketMessageKey('friends.inviter_unavailable'));
                        return;
                    }
                    await startChat(io, inviterId, currentUserId);
                } else {
                    // Notify inviter
                    io.to(`user-${inviterId}`).emit('invite_declined', buildSocketMessageKey('chat.invite_declined'));
                }
            } catch (error) {
                console.error('Error handling invite response:', error);
            }
        });

        // Complaint
        socket.on('complaint', async ({ chatId, reason, reportedTotalDurationSeconds }) => {
            try {
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
                if (duration < 300) return; // Can't complain if too short? Plan says "Check duration >= 5 mins"

                // Deduct chip
                await updateUserDataById(currentUserId, { complaintChips: Math.max(0, chips - 1) });

                // Update Chat
                const opponentId = chat.participants.find(p => p.toString() !== currentUserId);
                const now = new Date();
                const normalizedReason = normalizeComplaintReason(reason);
                if (!normalizedReason) return;

                const nextComplaint = {
                    from: String(currentUserId),
                    to: String(opponentId || ''),
                    reason: normalizedReason,
                    createdAt: now.toISOString(),
                };

                const blockedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                const blockedUntilIso = blockedUntil.toISOString();
                const opponentRow = await getUserRowById(opponentId);
                const opponentData = getUserData(opponentRow);
                const currentBlocked = Array.isArray(userData.blockedUsers) ? userData.blockedUsers : [];
                const opponentBlocked = Array.isArray(opponentData.blockedUsers) ? opponentData.blockedUsers : [];
                const nextBlocked = [
                    ...currentBlocked.filter((b) => String(b?.userId) !== String(opponentId)),
                    { userId: String(opponentId), until: blockedUntilIso, reason: 'quarrel' },
                ];
                const nextOpponentBlocked = [
                    ...opponentBlocked.filter((b) => String(b?.userId) !== String(currentUserId)),
                    { userId: String(currentUserId), until: blockedUntilIso, reason: 'quarrel' },
                ];
                await Promise.all([
                    updateUserDataById(currentUserId, { blockedUsers: nextBlocked }),
                    updateUserDataById(opponentId, { blockedUsers: nextOpponentBlocked }),
                ]);

                // Create Appeal entry for admin review if not exists (without messages snapshot until appeal)
                const existingAppeal = await findAppealByChat(chatId, currentUserId, opponentId, 'pending');
                let appealId = existingAppeal?._id || existingAppeal?.id;
                const autoResolveAt = hoursFromNow(AUTO_RESOLVE_HOURS).toISOString();
                if (!existingAppeal) {
                    const appeal = await insertAppeal({
                        chat: chatId,
                        complainant: currentUserId,
                        againstUser: opponentId,
                        reason: normalizedReason,
                        description: '',
                        messagesSnapshot: [],
                        autoResolveAt
                    });
                    appealId = appeal._id;
                }

                if (appealId) {
                    nextComplaint.appealId = appealId;
                }
                nextComplaint.autoResolveAt = autoResolveAt;

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

            } catch (error) {
                console.error('Error handling complaint:', error);
            }
        });

    });

    setInterval(async () => {
        try {
            const activeChats = await listActiveChats(1000);
            for (const chat of activeChats) {
                await closeIdleChatIfNeeded(io, chat);
            }
        } catch (error) {
            console.error('Error sweeping idle chats:', error);
        }
    }, CHAT_IDLE_SWEEP_INTERVAL_MS);
}

async function startChat(io, user1Id, user2Id) {
    await Promise.all([
        stopSearchForMatchedUser(user1Id),
        stopSearchForMatchedUser(user2Id),
    ]);

    const supabase = getSupabaseClient();
    const chatId = crypto.randomBytes(12).toString('hex');
    const now = Date.now();
    const readyAtIso = new Date(now + CHAT_PREPARE_DELAY_MS).toISOString();
    const countdownSeconds = Math.max(0, Math.ceil(CHAT_PREPARE_DELAY_MS / 1000));
    const u1 = String(user1Id);
    const u2 = String(user2Id);
    const { data: createdRow, error } = await supabase
        .from('chats')
        .insert({
            id: chatId,
            participants: [u1, u2],
            status: 'active',
            started_at: readyAtIso,
            disconnection_count: { [u1]: 0, [u2]: 0 },
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
        })
        .select('id')
        .maybeSingle();
    if (error || !createdRow) {
        throw new Error('Failed to create chat');
    }

    const [user1Row, user2Row] = await Promise.all([
        getUserRowById(user1Id),
        getUserRowById(user2Id),
    ]);
    const isFriendSnapshot = await friendService.areUsersFriends(user1Id, user2Id).catch(() => false);

    await chatService.touchChatActivity(String(createdRow.id), {
        startedAt: readyAtIso,
        lastActivityAt: new Date(now).toISOString(),
        isFriendSnapshot,
        participantLanguages: {
            [u1]: getUserLanguageFromRow(user1Row),
            [u2]: getUserLanguageFromRow(user2Row),
        },
    });
    setActiveChatContext(String(createdRow.id), {
        participants: [u1, u2],
        participantLanguages: {
            [u1]: getUserLanguageFromRow(user1Row),
            [u2]: getUserLanguageFromRow(user2Row),
        },
        startedAt: readyAtIso,
        status: 'active',
        isFriend: isFriendSnapshot,
        readyAt: readyAtIso,
        isPreparing: CHAT_PREPARE_DELAY_MS > 0,
    });

    // Сохраняем связь userId -> chatId
    userActiveChat.set(u1, String(createdRow.id));
    userActiveChat.set(u2, String(createdRow.id));

    await Promise.all([
        setUsersChatStatus([user1Id, user2Id], 'in_chat'),
        matchingService.updateChatHistory(user1Id, user2Id),
    ]);

    const chatRoomName = `${CHAT_ROOM_PREFIX}${chatId}`;
    try {
        await Promise.all([
            io.in(getUserRoomName(u1)).socketsJoin(chatRoomName),
            io.in(getUserRoomName(u2)).socketsJoin(chatRoomName),
        ]);
    } catch (_error) {
        // ignore room join failures; page will retry join on open
    }

    io.to(getUserRoomName(u1)).emit('chat_preparing', {
        chatId: String(createdRow.id),
        countdownSeconds,
        readyAt: readyAtIso,
    });
    io.to(getUserRoomName(u2)).emit('chat_preparing', {
        chatId: String(createdRow.id),
        countdownSeconds,
        readyAt: readyAtIso,
    });

    if (CHAT_PREPARE_DELAY_MS <= 0) {
        io.to(`user-${u1}`).emit('partner_found', { chatId: String(createdRow.id) });
        io.to(`user-${u2}`).emit('partner_found', { chatId: String(createdRow.id) });
        return;
    }

    const preparationTimeoutId = setTimeout(async () => {
        chatPreparationTimeouts.delete(String(createdRow.id));

        try {
            const currentChat = await getChatById(createdRow.id);
            if (!currentChat || currentChat.status !== 'active') {
                return;
            }

            setActiveChatContext(String(createdRow.id), {
                ...(activeChatContexts.get(String(createdRow.id)) || {}),
                participants: [u1, u2],
                participantLanguages: {
                    [u1]: getUserLanguageFromRow(user1Row),
                    [u2]: getUserLanguageFromRow(user2Row),
                },
                startedAt: readyAtIso,
                status: 'active',
                isFriend: isFriendSnapshot,
                readyAt: readyAtIso,
                isPreparing: false,
            });

            io.to(`user-${u1}`).emit('partner_found', { chatId: String(createdRow.id) });
            io.to(`user-${u2}`).emit('partner_found', { chatId: String(createdRow.id) });
        } catch (timeoutError) {
            console.error('Error finishing chat preparation:', timeoutError);
        }
    }, CHAT_PREPARE_DELAY_MS);

    chatPreparationTimeouts.set(String(createdRow.id), preparationTimeoutId);
}

// Function to notify both users about chat closure due to complaint
function notifyChatClosed(io, chatId, data) {
    if (!io) return;
    io.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('chat_closed', {
        reason: data.reason || 'complaint',
        complainant: data.complainant,
        appealId: data.appealId
    });
}

module.exports = {
    initSocketService,
    notifyChatClosed,
    getOnlineUserCount,
    isUserOnline,
    getOnlineUserIds,
    __testUtils: {
        addToQueue,
        removeFromQueue,
        getQueuedUser,
        setUsersChatStatus,
        clearPendingCallsForUser,
        resetRuntimeState,
    },
};

