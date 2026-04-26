const express = require('express');
const router = express.Router();
const battleController = require('../controllers/battleController');
const auth = require('../middleware/auth');

router.get('/current', auth, battleController.getCurrentBattle);
router.post('/join', auth, battleController.joinBattle);
router.post('/heartbeat', auth, battleController.battleHeartbeat);
router.get('/history', auth, battleController.getUserBattleHistory);
router.get('/summary', auth, battleController.getBattleSummary);
router.post('/damage', auth, battleController.submitDamage);

module.exports = router;
