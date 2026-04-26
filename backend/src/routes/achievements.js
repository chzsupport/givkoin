const express = require('express');

const auth = require('../middleware/auth');
const achievementController = require('../controllers/achievementController');

const router = express.Router();

router.get('/my', auth, achievementController.getMyAchievements);

module.exports = router;
