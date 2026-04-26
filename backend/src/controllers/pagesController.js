const { getPageTextBundle } = require('../services/pageTextService');

exports.getPages = async (_req, res) => {
  try {
    const payload = await getPageTextBundle();
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
