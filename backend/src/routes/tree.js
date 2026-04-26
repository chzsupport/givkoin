const express = require('express');
const treeController = require('../controllers/treeController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/status', auth, treeController.getTreeStatus);
router.post('/collect-fruit', auth, treeController.collectFruit);
router.get('/radiance', auth, treeController.getRadianceState);
router.post('/heal', auth, treeController.healTree);

module.exports = router;
