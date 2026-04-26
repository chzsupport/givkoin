const express = require('express');
const auth = require('../middleware/auth');
const economyController = require('../controllers/economyController');

const router = express.Router();

router.use(auth);

router.get('/history', economyController.getHistory);
router.get('/total-earned', economyController.getTotalEarned);

module.exports = router;
