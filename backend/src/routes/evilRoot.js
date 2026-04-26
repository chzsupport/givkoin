const express = require('express');
const auth = require('../middleware/auth');
const { submitSession } = require('../controllers/evilRootController');

const router = express.Router();

router.post('/session', auth, submitSession);

module.exports = router;
