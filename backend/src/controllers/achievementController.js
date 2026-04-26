const { listUserAchievements } = require('../services/achievementService');

exports.getMyAchievements = async (req, res) => {
  try {
    const rows = await listUserAchievements({ userId: req.user._id });
    res.json({ ok: true, achievements: rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('getMyAchievements error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
