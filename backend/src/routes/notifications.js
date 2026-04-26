const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

router.get('/', auth, notificationController.getNotifications);
router.get('/summary', auth, notificationController.getNotificationSummary);
router.post('/mark-read', auth, notificationController.markAsRead);

module.exports = router;
