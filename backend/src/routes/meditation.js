const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const meditationController = require('../controllers/meditationController');
const { settleIndividualMeditation } = require('../services/meditationRuntimeService');

router.get('/collective', meditationController.getCollectiveMeditation);
router.get('/collective/participants', auth, meditationController.getCollectiveParticipants);
router.post('/collective/opt-in', auth, meditationController.optInCollectiveMeditation);
router.post('/collective/opt-out', auth, meditationController.optOutCollectiveMeditation);
router.post('/collective/join', auth, meditationController.joinCollectiveMeditation);
router.post('/collective/finish', auth, meditationController.finishCollectiveMeditation);
router.post('/collective/heartbeat', auth, meditationController.recordCollectiveHeartbeat);

router.post('/individual/breath', auth, async (req, res) => {
  try {
    const clientEventId = String(req.body?.clientEventId || '').trim();
    if (!clientEventId) {
      return res.status(400).json({ message: 'Некорректный запрос' });
    }

    const result = await settleIndividualMeditation({
      userId: req.user._id,
      clientSessionId: `legacy_breath:${clientEventId}`,
      completedBreaths: 1,
    });

    return res.json({
      ok: true,
      countedBreaths: result.countedBreaths,
      grantedRadiance: result.grantedRadiance,
      remainingDaily: result.remainingDaily,
    });
  } catch (error) {
    console.error('Meditation individual legacy breath error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/individual/settle', auth, async (req, res) => {
  try {
    const clientSessionId = String(req.body?.clientSessionId || '').trim();
    const completedBreaths = Number(req.body?.completedBreaths);
    if (!clientSessionId || !Number.isFinite(completedBreaths) || completedBreaths < 0) {
      return res.status(400).json({ message: 'Некорректный запрос' });
    }

    const result = await settleIndividualMeditation({
      userId: req.user._id,
      clientSessionId,
      completedBreaths,
    });

    return res.json({
      ok: true,
      countedBreaths: result.countedBreaths,
      grantedRadiance: result.grantedRadiance,
      remainingDaily: result.remainingDaily,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Meditation individual settle error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/collective/participation', auth, async (req, res) => {
  return res.json({ ok: true, compatibility: true });
});

module.exports = router;
