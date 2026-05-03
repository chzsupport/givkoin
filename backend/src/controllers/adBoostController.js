const {
  completeAdBoost,
  startAdBoost,
} = require('../services/adBoostService');

exports.start = async (req, res) => {
  try {
    const offerId = String(req.body?.offerId || '').trim();
    if (!offerId) {
      return res.status(400).json({ message: 'Не найдено предложение' });
    }
    const result = await startAdBoost({ userId: req.user._id, offerId });
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Ошибка сервера' });
  }
};

exports.complete = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Не найден просмотр' });
    }
    const result = await completeAdBoost({ userId: req.user._id, sessionId });
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Ошибка сервера' });
  }
};
