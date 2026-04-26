const express = require('express');
const router = express.Router();
const nightShiftController = require('../controllers/nightShiftController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// User Routes
router.get('/status', auth, nightShiftController.getStatus);
router.post('/start', auth, nightShiftController.startShift);
router.post('/heartbeat', auth, nightShiftController.heartbeat);
router.post('/end', auth, nightShiftController.endShift);
router.get('/radar', auth, nightShiftController.getRadar);
router.post('/complete', auth, nightShiftController.completeMission);

// Admin Routes
router.get('/admin/data', auth, adminAuth, nightShiftController.getAdminData);
router.post('/admin/review', auth, adminAuth, nightShiftController.reviewShift);
router.get('/admin/settings', auth, adminAuth, nightShiftController.getSalarySettings);
router.post('/admin/settings', auth, adminAuth, nightShiftController.updateSalarySettings);

module.exports = router;
