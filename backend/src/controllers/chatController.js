const { sendComplaintNotification } = require('../services/emailService');
const { isComplaintBlocked } = require('../utils/penalties');
const chatService = require('../services/chatService');
const friendService = require('../services/friendService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getRequestLanguage } = require('../utils/requestLanguage');
const { normalizeComplaintReason } = require('../utils/complaintReason');
const {
    applyChatCompletionEffects,
    computeChatDurationSeconds,
} = require('../services/chatCompletionService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function normalizeLang(value) {
    return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

async function findPendingAppealByUser(againstUser) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'Appeal')
        .limit(500);
    if (error || !Array.isArray(data)) return null;
    return data.find((row) => {
        const d = row.data || {};
        return String(d.againstUser) === String(againstUser) && d.status === 'pending';
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
    return { _id: id, ...doc };
}

function toId(value, depth = 0) {
    if (depth > 3) return '';
    if (value == null) return '';
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
        hiddenFor: Array.isArray(row.hidden_for) ? row.hidden_for : [],
        complaint: row.complaint && typeof row.complaint === 'object' ? row.complaint : null,
        kAwarded: Boolean(row.k_awarded),
        waitingState: row.waiting_state && typeof row.waiting_state === 'object' ? row.waiting_state : null,
        disconnectionCount: row.disconnection_count && typeof row.disconnection_count === 'object' ? row.disconnection_count : {},
        createdAt: row.created_at ? new Date(row.created_at) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
}

async function getChatRowById(chatId, columns = '*') {
    const id = toId(chatId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('chats')
        .select(columns)
        .eq('id', String(id))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function getUsersByIds(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean)));
    if (!list.length) return new Map();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,nickname,email,data')
        .in('id', list);
    if (error) return new Map();
    return new Map((Array.isArray(data) ? data : []).map((row) => [String(row.id), row]));
}

function hydrateChatParticipants(chat) {
    const ids = Array.isArray(chat?.participants) ? chat.participants.map((p) => String(p)).filter(Boolean) : [];
    return getUsersByIds(ids).then((usersById) => {
        const hydrated = ids.map((id) => {
            const row = usersById.get(String(id));
            const data = row?.data && typeof row.data === 'object' ? row.data : {};
            return {
                _id: id,
                nickname: row?.nickname || 'Собеседник',
                email: row?.email,
                avatarUrl: data.avatarUrl || data.avatar || undefined,
            };
        });
        return { ...chat, participants: normalizeParticipants(hydrated) };
    });
}

function buildHydratedParticipants(ids, usersById) {
    const hydrated = ids.map((id) => {
        const row = usersById.get(String(id));
        const data = row?.data && typeof row.data === 'object' ? row.data : {};
        return {
            _id: id,
            nickname: row?.nickname || 'Собеседник',
            email: row?.email,
            avatarUrl: data.avatarUrl || data.avatar || undefined,
        };
    });
    return normalizeParticipants(hydrated);
}

async function hydrateChatsParticipants(chats) {
    const safeChats = Array.isArray(chats) ? chats : [];
    const participantIds = Array.from(new Set(
        safeChats.flatMap((chat) => (Array.isArray(chat?.participants) ? chat.participants : []).map((id) => String(id)).filter(Boolean))
    ));
    const usersById = await getUsersByIds(participantIds);
    return safeChats.map((chat) => {
        const ids = Array.isArray(chat?.participants) ? chat.participants.map((id) => String(id)).filter(Boolean) : [];
        return {
            ...chat,
            participants: buildHydratedParticipants(ids, usersById),
        };
    });
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLikelyEmail(value) {
    const v = String(value || '').trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function pickNickname(candidate) {
    const v = String(candidate || '').trim();
    if (!v) return '';
    if (isLikelyEmail(v)) return '';
    return v;
}

function extractParticipantId(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;

    if (typeof raw.toString === 'function') {
        const direct = raw.toString();
        if (direct && direct !== '[object Object]') return direct;
    }

    if (isPlainObject(raw)) {
        const idFromSelf = extractParticipantId(raw._id);
        if (idFromSelf) return idFromSelf;
        const idFromUser = extractParticipantId(raw.user);
        if (idFromUser) return idFromUser;
        const idFromNestedUser = extractParticipantId(raw.user?._id);
        if (idFromNestedUser) return idFromNestedUser;
    }

    return '';
}

function normalizeParticipant(raw) {
    const id = extractParticipantId(raw);
    if (!id) return null;

    const source = isPlainObject(raw?.user) ? raw.user : raw;
    const nickname = pickNickname(source?.nickname) || 'Собеседник';
    const avatarUrl = String(source?.avatarUrl || source?.avatar || '').trim() || undefined;

    return {
        _id: id,
        nickname,
        avatarUrl,
    };
}

function normalizeParticipants(list) {
    if (!Array.isArray(list)) return [];
    const normalized = [];
    const seen = new Set();

    for (const row of list) {
        const p = normalizeParticipant(row);
        if (!p) continue;
        if (seen.has(p._id)) continue;
        seen.add(p._id);
        normalized.push(p);
    }

    return normalized;
}

function getPartnerId(participants, userId) {
    const me = String(userId || '');
    if (!me || !Array.isArray(participants)) return '';
    const partner = participants.find((p) => String(p?._id || '') !== me);
    return partner?._id ? String(partner._id) : '';
}

function hasParticipantAccess(chat, userId) {
    const me = String(userId || '');
    if (!me || !Array.isArray(chat?.participants)) return false;
    return chat.participants.some((participant) => extractParticipantId(participant) === me);
}

function mapUserSocialDoc(row) {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    return {
        _id: row?.id ? String(row.id) : '',
        friends: Array.isArray(data.friends) ? data.friends : [],
        friendRequests: Array.isArray(data.friendRequests) ? data.friendRequests : [],
    };
}

async function getRelationshipMap(viewerId, targetIds = []) {
    const viewerKey = String(viewerId || '').trim();
    const ids = Array.from(new Set((Array.isArray(targetIds) ? targetIds : []).map((id) => String(id || '').trim()).filter(Boolean)));
    const out = new Map();

    if (!viewerKey || !ids.length) return out;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,data')
        .in('id', Array.from(new Set([viewerKey, ...ids])));

    if (error || !Array.isArray(data)) return out;

    const docsById = new Map(data.map((row) => [String(row.id), mapUserSocialDoc(row)]));
    const viewer = docsById.get(viewerKey);
    if (!viewer) return out;

    ids.forEach((targetId) => {
        const target = docsById.get(String(targetId));
        if (!target) return;
        out.set(String(targetId), friendService.computeRelationshipFromUsers(viewer, target));
    });

    return out;
}

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,data')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const row = await getUserRowById(userId);
    if (!row) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

// GET /api/chats/active - Получить активный чат пользователя
async function getActiveChat(req, res) {
    try {
        const userId = req.user._id || req.user.userId;
        const supabase = getSupabaseClient();
        const { data: row, error } = await supabase
            .from('chats')
            .select('*')
            .contains('participants', [String(userId)])
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            console.error('Get active chat query error:', error);
            return res.json({ activeChat: null });
        }

        const chat = mapChatRow(row);

        if (!chat) {
            return res.json({ activeChat: null });
        }

        if (Array.isArray(chat.hiddenFor) && chat.hiddenFor.map(String).includes(String(userId))) {
            return res.json({ activeChat: null });
        }

        const safeChat = await hydrateChatParticipants(chat).catch((hydrateError) => {
            console.error('Get active chat hydrate error:', hydrateError);
            return null;
        });
        if (!safeChat) {
            return res.json({ activeChat: null });
        }
        return res.json({ activeChat: safeChat });
    } catch (error) {
        console.error('Get active chat error:', error);
        return res.json({ activeChat: null });
    }
}

// GET /api/chats/history
async function getChatHistory(req, res) {
    try {
        const userId = req.user._id || req.user.userId;

        const supabase = getSupabaseClient();
        const { data: rows, error } = await supabase
            .from('chats')
            .select('*')
            .contains('participants', [String(userId)])
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) {
            return res.status(500).json({ message: 'Error fetching chat history', error: error.message });
        }

        const mapped = (Array.isArray(rows) ? rows : []).map(mapChatRow);
        const visible = mapped.filter((chat) => !(Array.isArray(chat.hiddenFor) && chat.hiddenFor.map(String).includes(String(userId))));

        const safeChats = await hydrateChatsParticipants(visible);
        const partnerIds = Array.from(new Set(
            safeChats
                .map((chat) => getPartnerId(Array.isArray(chat.participants) ? chat.participants : [], userId))
                .filter(Boolean)
        ));
        const relationshipMap = await getRelationshipMap(userId, partnerIds);

        const chatsWithRelationship = safeChats.map((chat) => {
            const participants = Array.isArray(chat.participants) ? chat.participants : [];
            const partnerId = getPartnerId(participants, userId);
            return {
                ...chat,
                relationship: partnerId ? (relationshipMap.get(String(partnerId)) || null) : null,
            };
        });

        res.json(chatsWithRelationship);
    } catch (error) {
        console.error('Get chat history error:', error);
        res.status(500).json({ message: 'Error fetching chat history', error: error.message });
    }
}

// GET /api/chats/:chatId
async function getChatDetails(req, res) {
    try {
        const { chatId } = req.params;
        const row = await getChatRowById(chatId, 'id,participants,status,started_at,ended_at,duration,messages_count,ratings,hidden_for,complaint,k_awarded,waiting_state,disconnection_count,created_at,updated_at');
        const chat = mapChatRow(row);

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // Check access
        const userId = req.user._id || req.user.userId;
        const isParticipant = hasParticipantAccess(chat, userId);
        if (!isParticipant && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const safeChat = await hydrateChatParticipants(chat);
        if (safeChat && typeof safeChat === 'object') {
            delete safeChat.ratings;
        }
        const partnerId = getPartnerId(safeChat.participants, userId);
        const relationship = partnerId
            ? await friendService.getRelationship({ viewerId: userId, targetId: partnerId })
            : null;

        res.json({
            ...safeChat,
            relationship,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chat details', error: error.message });
    }
}

// GET /api/chats/:chatId/messages
async function getChatMessages(req, res) {
    try {
        const { chatId } = req.params;
        const sinceRaw = String(req.query?.since || '').trim();
        // Check access first
        const chatRow = await getChatRowById(chatId, 'id,participants,status');
        const chat = mapChatRow(chatRow);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        const userId = req.user._id || req.user.userId;
        const isParticipant = hasParticipantAccess(chat, userId);
        if (!isParticipant && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const messages = await chatService.listMessages(chatId, { since: sinceRaw || undefined });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
}

// POST /api/chats/:chatId/messages
async function sendChatMessage(req, res) {
    try {
        const { chatId } = req.params;
        const userId = req.user._id || req.user.userId;
        const text = String(req.body?.text || '').trim();

        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');

        if (!text) {
            return res.status(400).json({
                message: pickLang(userLang, 'Текст сообщения обязателен', 'Message text is required'),
            });
        }

        const chatRow = await getChatRowById(chatId, 'id,participants,status');
        const chat = mapChatRow(chatRow);
        if (!chat) {
            return res.status(404).json({ message: pickLang(userLang, 'Чат не найден', 'Chat not found') });
        }

        const isParticipant = hasParticipantAccess(chat, userId);
        if (!isParticipant) {
            return res.status(403).json({ message: pickLang(userLang, 'Вы не участник этого чата', 'You are not a participant of this chat') });
        }

        if (chat.status !== 'active') {
            return res.status(400).json({ message: pickLang(userLang, 'Чат завершён', 'Chat is closed') });
        }

        const message = await chatService.createMessage({
            chatId,
            senderId: userId,
            content: text,
            chatContext: {
                participants: Array.isArray(chat.participants) ? chat.participants : [],
                status: chat.status,
            },
        });

        const payload = {
            _id: message._id,
            chatId: message.chatId,
            senderId: message.senderId,
            originalText: message.originalText,
            translatedText: message.translatedText,
            createdAt: message.createdAt,
            status: message.status,
        };

        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                io.to(`chat-${chatId}`).emit('new_message', payload);
            }
        } catch (_error) {
            // ignore socket broadcast errors in HTTP fallback mode
        }

        return res.status(201).json(payload);
    } catch (error) {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        return res.status(500).json({
            message: pickLang(userLang, 'Ошибка отправки сообщения', 'Failed to send message'),
            error: error.message,
        });
    }
}

// POST /api/chats/:chatId/appeal
async function appealChat(req, res) {
    try {
        const { chatId } = req.params;
        const { reason } = req.body;

        // Logic for appeal (e.g., create Appeal model entry)
        // For now, just log or update chat
        // const appeal = await Appeal.create({ ... });

        res.json({ message: 'Appeal submitted' });
    } catch (error) {
        res.status(500).json({ message: 'Error submitting appeal', error: error.message });
    }
}

// POST /api/chats/:chatId/complaint
async function submitComplaint(req, res) {
    try {
        const { chatId } = req.params;
        const { reason, reportedTotalDurationSeconds } = req.body;
        const userId = req.user._id || req.user.userId;

        const userLang = normalizeLang(getRequestLanguage(req));
        const normalizedReason = normalizeComplaintReason(reason);

        if (!normalizedReason) {
            return res.status(400).json({ message: pickLang(userLang, 'Причина жалобы обязательна', 'Complaint reason is required') });
        }

        // Проверяем существование чата
        const chatRow = await getChatRowById(chatId);
        const chat = mapChatRow(chatRow);
        if (!chat) {
            return res.status(404).json({ message: pickLang(userLang, 'Чат не найден', 'Chat not found') });
        }

        // Проверяем, что пользователь - участник чата
        const isParticipant = hasParticipantAccess(chat, userId);
        if (!isParticipant) {
            return res.status(403).json({ message: pickLang(userLang, 'Вы не участник этого чата', 'You are not a participant of this chat') });
        }

        // Проверяем статус чата
        if (chat.status !== 'active') {
            return res.status(400).json({
                message: pickLang(userLang, 'Чат уже завершен или имеет жалобу', 'Chat is already closed or already has a complaint'),
            });
        }

        // Проверяем наличие фишек для жалоб
        const userRow = await getUserRowById(userId);
        if (!userRow) {
            return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
        }
        const userData = getUserData(userRow);

        if (isComplaintBlocked({ complaintBlockedUntil: userData.complaintBlockedUntil })) {
            return res.status(403).json({
                message: pickLang(userLang, 'Подача жалоб временно заблокирована', 'Submitting complaints is temporarily blocked'),
                until: userData.complaintBlockedUntil,
            });
        }

        const hasPendingAgainst = await findPendingAppealByUser(userId);
        if (hasPendingAgainst) {
            return res.status(403).json({
                message: pickLang(userLang, 'На вас идёт проверка апелляции, жаловаться пока нельзя', 'Your appeal is under review, you cannot submit complaints right now'),
            });
        }

        const currentComplaintChips = Number(userData.complaintChips) || 0;
        if (currentComplaintChips <= 0) {
            return res.status(400).json({ message: pickLang(userLang, 'У вас закончились фишки для жалоб', 'You have no complaint chips left') });
        }

        // Определяем собеседника
        const opponentId = Array.isArray(chat.participants)
            ? chat.participants.find((p) => String(p) !== String(userId))
            : '';

        const now = new Date();
        const blockedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Создаем Appeal (pending) сразу, но без переписки (приватность до апелляции)
        const autoResolveAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const appeal = await insertAppeal({
            chat: chatId,
            complainant: userId,
            againstUser: opponentId,
            reason: normalizedReason,
            description: '',
            messagesSnapshot: [],
            autoResolveAt,
            status: 'pending',
        });

        // Обновляем чат
        const durationSeconds = computeChatDurationSeconds({
            startedAt: chat.startedAt || now,
            endedAt: now,
            reportedTotalDurationSeconds,
            waitingSince: chat.waitingState?.isWaiting ? chat.waitingState?.waitingSince : null,
        });
        const supabase = getSupabaseClient();
        const nowIso = now.toISOString();
        const { error: chatUpdateError } = await supabase
            .from('chats')
            .update({
                status: 'complained',
                ended_at: nowIso,
                duration: durationSeconds,
                complaint: {
                    from: String(userId),
                    to: String(opponentId),
                    reason: normalizedReason,
                    createdAt: nowIso,
                    messagesSnapshot: [],
                    autoResolveAt: appeal.autoResolveAt,
                    appealId: String(appeal._id),
                },
                updated_at: nowIso,
            })
            .eq('id', String(chatId));
        if (chatUpdateError) {
            return res.status(500).json({
                message: pickLang(userLang, 'Ошибка при подаче жалобы', 'Failed to submit complaint'),
                error: chatUpdateError.message,
            });
        }

        // Уменьшаем количество фишек
        const remainingChips = Math.max(0, currentComplaintChips - 1);
        await updateUserDataById(userId, { complaintChips: remainingChips });

        // Ссорившиеся: блокируем подбор на 7 дней
        const opponentUserId = String(opponentId || '');
        const opponentRow = opponentUserId ? await getUserRowById(opponentUserId) : null;
        const opponentData = getUserData(opponentRow);

        const userBlocked = Array.isArray(userData.blockedUsers) ? userData.blockedUsers : [];
        const opponentBlocked = Array.isArray(opponentData.blockedUsers) ? opponentData.blockedUsers : [];

        const blockedUntilIso = blockedUntil.toISOString();
        const nextUserBlocked = [
            ...userBlocked.filter((b) => String(b?.userId) !== opponentUserId),
            { userId: opponentUserId, until: blockedUntilIso, reason: 'quarrel' },
        ];
        const nextOpponentBlocked = [
            ...opponentBlocked.filter((b) => String(b?.userId) !== String(userId)),
            { userId: String(userId), until: blockedUntilIso, reason: 'quarrel' },
        ];

        await Promise.all([
            updateUserDataById(userId, { blockedUsers: nextUserBlocked }),
            opponentUserId ? updateUserDataById(opponentUserId, { blockedUsers: nextOpponentBlocked }) : null,
        ]);

        // Отправляем уведомление через socket обоим участникам чата сразу,
        // а тяжёлую служебную часть добиваем уже после ответа.
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                io.to(`chat-${chatId}`).emit('chat_closed', {
                    reason: 'complaint',
                    complainant: userId.toString()
                });
            }
        } catch (err) {
            console.error('Socket notification error:', err);
        }

        res.status(201).json({
            success: true,
            message: pickLang(userLang, 'Жалоба успешно подана', 'Complaint submitted successfully'),
            remainingChips,
            appealId: String(appeal._id),
        });

        setTimeout(() => {
            Promise.resolve()
                .then(async () => {
                    await chatService.markForAppeal(chatId, autoResolveAt);
                    await applyChatCompletionEffects({ chatId, durationSeconds });

                    if (opponentUserId) {
                        await Promise.all([
                            updateUserDataById(userId, { chatStatus: 'available' }),
                            updateUserDataById(opponentUserId, { chatStatus: 'available' }),
                        ]).catch(() => { });
                    }

                    const opponentEmail = String(opponentRow?.email || '').trim();
                    const opponentNickname = String(opponentRow?.nickname || '').trim();
                    const opponentLang = (opponentRow?.language || opponentRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
                    if (opponentEmail) {
                        await sendComplaintNotification(opponentEmail, opponentNickname, 24, opponentLang).catch((err) => {
                            console.error('Failed to send complaint notification email:', err);
                        });
                    }
                })
                .catch((error) => {
                    console.error('Deferred complaint finalization error:', error);
                });
        }, 0);
    } catch (error) {
        console.error('Submit complaint error:', error);
        const userLang = normalizeLang(getRequestLanguage(req));
        res.status(500).json({
            message: pickLang(userLang, 'Ошибка при подаче жалобы', 'Failed to submit complaint'),
            error: error.message,
        });
    }
}

// POST /api/chats/:chatId/delete
async function deleteChat(req, res) {
    try {
        const { chatId } = req.params;
        const userId = req.user._id || req.user.userId;

        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');

        const row = await getChatRowById(chatId);
        const chat = mapChatRow(row);
        if (!chat) {
            return res.status(404).json({ message: pickLang(userLang, 'Чат не найден', 'Chat not found') });
        }

        // Проверяем, что пользователь - участник чата
        const isParticipant = hasParticipantAccess(chat, userId);
        if (!isParticipant) {
            return res.status(403).json({ message: pickLang(userLang, 'Вы не участник этого чата', 'You are not a participant of this chat') });
        }

        // Мягкое удаление - добавляем пользователя в список "скрывших" чат
        const hiddenFor = Array.isArray(chat.hiddenFor) ? chat.hiddenFor.map(String) : [];
        const me = String(userId);
        const nextHiddenFor = hiddenFor.includes(me) ? hiddenFor : [...hiddenFor, me];
        const supabase = getSupabaseClient();
        await supabase
            .from('chats')
            .update({ hidden_for: nextHiddenFor, updated_at: new Date().toISOString() })
            .eq('id', String(chatId));

        res.json({ success: true, message: pickLang(userLang, 'Чат удален из истории', 'Chat removed from history') });
    } catch (error) {
        console.error('Delete chat error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        res.status(500).json({
            message: pickLang(userLang, 'Ошибка при удалении чата', 'Failed to delete chat'),
            error: error.message,
        });
    }
}

module.exports = {
    getActiveChat,
    getChatHistory,
    getChatDetails,
    getChatMessages,
    sendChatMessage,
    appealChat,
    submitComplaint,
    deleteChat
};

