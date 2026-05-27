const { getSupabaseClient } = require('../../lib/supabaseClient');
const { listAllDocsByModel } = require('../../services/documentStore');
const { getUsersByIds, toId } = require('./userLookup');

const getAuditLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

        const all = await listAllDocsByModel('AdminAudit', { pageSize: 1000 });
        all.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });

        const logs = all.slice((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit);

        const safeLogs = Array.isArray(logs) ? logs : [];
        const userIds = Array.from(new Set(safeLogs
            .map((row) => (row?.user ? String(row.user) : ''))
            .filter(Boolean)));
        const supabase = getSupabaseClient();
        const { data: users, error } = userIds.length
            ? await supabase
                .from('users')
                .select('id,nickname,email,status')
                .in('id', userIds)
            : { data: [], error: null };
        if (error) return res.status(500).json({ message: error.message });

        const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [String(u.id), u]));
        const enrichedLogs = safeLogs.map((row) => {
            const id = row?.user ? String(row.user) : '';
            const u = id ? userMap.get(id) : null;
            return {
                ...row,
                user: u ? { _id: u.id, nickname: u.nickname, email: u.email, status: u.status } : row.user,
            };
        });

        const count = all.length;

        res.json({
            logs: enrichedLogs,
            totalPages: Math.ceil(count / safeLimit),
            currentPage: safePage
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const normalizeMessages = async (messages) => {
    const senderIds = Array.from(
        new Set((Array.isArray(messages) ? messages : []).map((m) => toId(m?.sender_id)).filter(Boolean))
    );
    const usersById = await getUsersByIds(senderIds);

    return (Array.isArray(messages) ? messages : []).map((m) => {
        const senderId = toId(m?.sender_id);
        const sender = senderId ? usersById.get(senderId) : null;
        return {
            _id: String(m.id),
            chatId: String(m.chat_id),
            senderId,
            sender: sender ? { _id: sender.id, nickname: sender.nickname, email: sender.email } : null,
            content: String(m.original_text ?? ''),
            translatedContent: String(m.translated_text ?? ''),
            createdAt: m.created_at,
            status: m.status,
        };
    });
};

const getChatHistory = async (req, res) => {
    try {
        const { chatId, userId } = req.query;
        const scopedUserId = req.params?.id || userId || null;
        const supabase = getSupabaseClient();

        const scopedUserKey = scopedUserId ? String(scopedUserId) : '';
        const chatKey = chatId ? String(chatId) : '';

        if (scopedUserKey) {
            const { data: userChats, error: chatError } = await supabase
                .from('chats')
                .select('id')
                .contains('participants', [scopedUserKey]);
            if (chatError) {
                return res.status(500).json({ message: 'Ошибка чтения чатов' });
            }
            const chatIds = (Array.isArray(userChats) ? userChats : []).map((c) => String(c.id)).filter(Boolean);
            if (!chatIds.length) return res.json([]);

            if (chatKey) {
                const isAllowedChat = chatIds.some((id) => String(id) === String(chatKey));
                if (!isAllowedChat) return res.json([]);
            }

            const { data: messages, error: messageError } = await supabase
                .from('chat_messages')
                .select('id,chat_id,sender_id,original_text,translated_text,created_at,status')
                .in('chat_id', chatKey ? [chatKey] : chatIds)
                .order('created_at', { ascending: true })
                .limit(500);
            if (messageError) {
                return res.status(500).json({ message: 'Ошибка чтения сообщений' });
            }

            return res.json(await normalizeMessages(messages));
        }

        if (!chatKey) return res.json([]);

        const { data: messages, error: messageError } = await supabase
            .from('chat_messages')
            .select('id,chat_id,sender_id,original_text,translated_text,created_at,status')
            .eq('chat_id', chatKey)
            .order('created_at', { ascending: true })
            .limit(500);
        if (messageError) {
            return res.status(500).json({ message: 'Ошибка чтения сообщений' });
        }

        return res.json(await normalizeMessages(messages));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBattleHistory = async (_req, res) => {
    try {
        const all = await listAllDocsByModel('Battle', { pageSize: 1000 });
        all.sort((a, b) => {
            const aTime = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
            const bTime = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
            return bTime - aTime;
        });
        res.json(all.slice(0, 50));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAuditLogs,
    getChatHistory,
    getBattleHistory,
};
