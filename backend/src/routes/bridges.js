const express = require('express');
const router = express.Router();
const bridgeController = require('../controllers/bridgeController');
const auth = require('../middleware/auth');

router.get('/', auth, bridgeController.getAllBridges);
router.get('/my', auth, bridgeController.getMyBridges);
router.get('/stats', auth, bridgeController.getBridgeStats);
router.post('/', auth, bridgeController.createBridge);
router.post('/:bridgeId/contribute', auth, bridgeController.contributeToBridge);
router.delete('/:bridgeId', auth, bridgeController.deleteBridge);

module.exports = router;
