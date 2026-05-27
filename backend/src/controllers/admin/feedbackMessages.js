const { adminAudit } = require('../../middleware/adminAudit');
const { deleteFeedbackMessageTotally } = require('../../services/adminCleanupService');
const emailService = require('../../services/emailService');
const {
    getDocByModelAndId,
    listDocsByModel,
    updateDocByModel,
} = require('../../services/documentStore');

function stripStoredDocFields(doc) {
    const next = doc && typeof doc === 'object' ? { ...doc } : {};
    delete next._id;
    delete next.id;
    delete next.createdAt;
    delete next.updatedAt;
    return next;
}

async function getModelDocById(model, id) {
    if (!id) return null;
    return getDocByModelAndId(model, id);
}

async function updateModelDoc(model, id, patch) {
    if (!id || !patch || typeof patch !== 'object') return null;

    const current = await getModelDocById(model, id);
    if (!current) return null;

    const next = { ...stripStoredDocFields(current), ...patch };
    return updateDocByModel(model, id, next).catch(() => null);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

exports.getFeedbackMessages = async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        let items = (await listDocsByModel('FeedbackMessage', { limit: 1000 })).map((item) => ({
            ...item,
            status: String(item?.status || 'new'),
        }));
        if (status) {
            items = items.filter((item) => String(item?.status || 'new') === String(status));
        }

        items.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });

        const count = items.length;
        const offset = (Number(page) - 1) * Number(limit);
        const pagedItems = items.slice(offset, offset + Number(limit));

        res.json({
            messages: pagedItems,
            totalPages: Math.ceil(count / Number(limit)),
            currentPage: Number(page),
            totalMessages: count,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.archiveFeedbackMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await getModelDocById('FeedbackMessage', id);
        if (!existing) return res.status(404).json({ message: 'Сообщение не найдено' });

        const nowIso = new Date().toISOString();
        await updateModelDoc('FeedbackMessage', id, {
            status: 'archived',
            archivedAt: nowIso,
        });

        await adminAudit('feedback.archive', req, { feedbackId: id });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.replyFeedbackMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const subjectRaw = String(req.body?.subject || '').trim();
        const messageRaw = String(req.body?.message || '').trim();
        if (!messageRaw) return res.status(400).json({ message: 'Текст ответа обязателен' });
        if (messageRaw.length > 10000) return res.status(400).json({ message: 'Максимум 10 000 символов' });

        const existing = await getModelDocById('FeedbackMessage', id);
        if (!existing) return res.status(404).json({ message: 'Сообщение не найдено' });

        const to = String(existing?.email || '').trim().toLowerCase();
        if (!to) return res.status(400).json({ message: 'У сообщения нет почты для ответа' });

        const subject = subjectRaw || 'Ответ GIVKOIN на ваше обращение';
        const safeName = escapeHtml(String(existing?.name || '').trim() || 'друг');
        const safeMessage = escapeHtml(messageRaw).replace(/\r?\n/g, '<br/>');

        await emailService.sendGenericEventEmail(
            to,
            subject,
            `
              <h2>Здравствуйте, ${safeName}!</h2>
              <p>Это ответ команды GIVKOIN на ваше обращение.</p>
              <div style="margin:16px 0;padding:12px;border-radius:8px;border:1px solid #e5e7eb;background:#f8fafc;">
                ${safeMessage}
              </div>
            `
        );

        const nowIso = new Date().toISOString();
        const existingReplies = Array.isArray(existing?.replies) ? existing.replies : [];
        await updateModelDoc('FeedbackMessage', id, {
            repliedAt: nowIso,
            replies: [
                ...existingReplies,
                {
                    sentAt: nowIso,
                    subject,
                    message: messageRaw,
                    adminId: req.user?._id || null,
                    adminEmail: req.user?.email || null,
                },
            ],
        });

        await adminAudit('feedback.reply', req, { feedbackId: id, to });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteFeedbackMessage = async (req, res) => {
    try {
        const { id } = req.params;
        await deleteFeedbackMessageTotally(id);

        await adminAudit('feedback.delete', req, { feedbackId: id });
        res.json({ ok: true });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};
