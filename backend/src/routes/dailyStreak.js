const express = require('express');
const auth = require('../middleware/auth');
const dailyStreakController = require('../controllers/dailyStreakController');

const router = express.Router();

router.get('/state', auth, dailyStreakController.getState);
router.get('/today', auth, dailyStreakController.getTodayQuestStatus);
router.post('/claim', auth, dailyStreakController.claimToday);
router.post('/quest/complete', auth, dailyStreakController.completeQuestToday);
router.post('/welcome/seen', auth, dailyStreakController.markWelcomeSeen);

module.exports = router;
