const express = require('express');
const auth = require('../middleware/auth');
const {
  getReferralInfo,
  claimReferral,
  getManualBoostStatus,
  createManualBoostStep,
} = require('../controllers/referralController');

const router = express.Router();

router.get('/', auth, getReferralInfo);
router.post('/claim', auth, claimReferral);
router.get('/manual-boost/status', auth, getManualBoostStatus);
router.post('/manual-boost/step', auth, createManualBoostStep);

module.exports = router;
