const express = require('express');
const { createAppeal, resolveAppeal, submitAppealText } = require('../controllers/appealController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

router.post('/', auth, createAppeal);
router.post('/:id/resolve', auth, adminAuth, resolveAppeal);
router.post('/:id/appeal-text', auth, submitAppealText);

module.exports = router;
