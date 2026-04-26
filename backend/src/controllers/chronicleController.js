const { createDailyChronicle, listChronicle } = require('../services/chronicleService');

exports.getLatest = async (_req, res, next) => {
  try {
    const doc = await createDailyChronicle();
    return res.json({ chronicle: doc });
  } catch (err) {
    return next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 7));
    const docs = await listChronicle(limit);
    return res.json({ chronicles: docs });
  } catch (err) {
    return next(err);
  }
};
