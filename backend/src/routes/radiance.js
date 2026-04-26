const express = require('express');
const auth = require('../middleware/auth');
const radianceController = require('../controllers/radianceController');

const router = express.Router();

router.use(auth);

router.get('/history', radianceController.getHistory);
router.get('/total-earned', radianceController.getTotalEarned);

module.exports = router;
