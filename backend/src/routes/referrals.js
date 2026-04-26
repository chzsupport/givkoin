const express = require('express');
const auth = require('../middleware/auth');
const { getReferralInfo, claimReferral } = require('../controllers/referralController');

const router = express.Router();

router.get('/', auth, getReferralInfo);
router.post('/claim', auth, claimReferral);

module.exports = router;
