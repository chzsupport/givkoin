const express = require('express');
const solarController = require('../controllers/solarController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, solarController.getSolarStatus);
router.post('/collect', auth, solarController.collectSolarCharge);
router.post('/share', auth, solarController.shareSolarLumens);

module.exports = router;
