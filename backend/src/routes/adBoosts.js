const express = require('express');
const auth = require('../middleware/auth');
const adBoostController = require('../controllers/adBoostController');

const router = express.Router();

router.use(auth);
router.post('/start', adBoostController.start);
router.post('/complete', adBoostController.complete);

module.exports = router;
