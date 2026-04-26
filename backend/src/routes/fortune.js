const express = require('express');
const router = express.Router();
const fortuneController = require('../controllers/fortuneController');
const auth = require('../middleware/auth');

router.get('/status', auth, fortuneController.getSpinStatus);
router.get('/config', auth, fortuneController.getConfig);
router.post('/spin', auth, fortuneController.spin);
router.get('/stats', fortuneController.getGlobalStats);
router.get('/stats/user', auth, fortuneController.getUserStats);
router.post('/lucky-draw', auth, fortuneController.luckyDraw);

// Лотерея
router.get('/lottery/status', auth, fortuneController.getLotteryStatus);
router.post('/lottery/buy', auth, fortuneController.buyLotteryTicket);
router.get('/lottery/results', auth, fortuneController.getLotteryResults);

module.exports = router;
