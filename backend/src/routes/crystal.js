const express = require('express');
const auth = require('../middleware/auth');
const crystalController = require('../controllers/crystalController');

const router = express.Router();

// Публичный — локации доступны всем (для отображения осколков)
router.get('/locations', crystalController.getLocationsPublic);

// Приватные — требуют авторизации
router.get('/status', auth, crystalController.getCrystalStatus);
router.post('/collect', auth, crystalController.collectShard);
router.post('/complete', auth, crystalController.completeCollection);

module.exports = router;
