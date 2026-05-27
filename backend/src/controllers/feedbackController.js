const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { insertDoc } = require('../services/documentStore');

async function insertFeedbackMessage(doc) {
  const id = `fb_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const inserted = await insertDoc({ model: 'FeedbackMessage', id, data: doc });
  return { ...doc, _id: inserted?._id || id };
}

exports.createFeedback = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const message = String(req.body?.message || '');

    if (!email) {
      return res.status(400).json({ message: 'Почта обязательна' });
    }

    if (!message.trim()) {
      return res.status(400).json({ message: 'Текст сообщения обязателен' });
    }

    if (message.length > 10000) {
      return res.status(400).json({ message: 'Максимум 10 000 символов' });
    }

    const doc = await insertFeedbackMessage({
      name: name || undefined,
      email,
      message,
      userId: req.user?._id,
      status: 'new',
    });

    if (req.user?._id) {
      awardRadianceForActivity({
        userId: req.user._id,
        amount: 10,
        activityType: 'feedback_letter',
        meta: { feedbackId: doc._id },
        dedupeKey: `feedback_letter:${doc._id}:${req.user._id}`,
        dailyLimit: 3,
      }).catch(() => { });
    }

    res.status(201).json({ ok: true, message: 'Отправлено', id: doc._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
