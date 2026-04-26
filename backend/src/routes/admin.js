const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminV2Routes = require('./adminV2');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// All admin routes require authentication and admin role
router.use(auth);
router.use(adminAuth);

// User management
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.patch('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/reset-password', adminController.resetUserPassword);
router.get('/users/:id/chats', adminController.getChatHistory);

// Admins management
router.get('/admins', adminController.getAdmins);
router.post('/admins', adminController.createAdmin);
router.patch('/admins/:id/email', adminController.updateAdminEmail);

// Referrals management
router.get('/referrals', adminController.getReferrals);

// Entities management
router.get('/entities', adminController.getEntities);
router.patch('/entities/:id/avatar', adminController.updateEntityAvatar);
router.delete('/entities/:id', adminController.deleteEntity);

// Appeals management
router.get('/appeals', adminController.getAppeals);
router.post('/appeals/:id/handle', adminController.handleAppeal);

// Stats & Logs
router.get('/stats', adminController.getStats);
router.get('/logs', adminController.getAuditLogs);
router.get('/battles', adminController.getBattleHistory);
router.get('/battles/suspicious', adminController.getSuspiciousBattleUsers);
router.get('/battles/control', adminController.getBattleControl);
router.get('/battles/mood', adminController.getBattleMoodForecast);
router.post('/battles/start', adminController.startBattleNow);
router.post('/battles/schedule', adminController.scheduleBattle);
router.post('/battles/schedule/clear-next', adminController.clearUpcomingBattle);
router.post('/battles/schedule/:id/cancel', adminController.cancelScheduledBattle);
router.delete('/battles/schedule/:id', adminController.cancelScheduledBattle);
router.post('/battles/finish', adminController.finishBattleNow);
router.get('/chats', adminController.getChatHistory);

// Settings
router.get('/settings', adminController.getSettings);
router.patch('/settings', adminController.updateSettings);
router.get('/settings/meditation', adminController.getCollectiveMeditationSettings);
router.patch('/settings/meditation', adminController.updateCollectiveMeditationSettings);
router.get('/settings/rules', adminController.getRules);
router.patch('/settings/rules', adminController.updateRules);
router.get('/settings/pages', adminController.getPagesContent);
router.patch('/settings/pages', adminController.updatePagesContent);
router.get('/settings/ads', adminController.getAdSettings);
router.patch('/settings/ads', adminController.updateAdSettings);
router.post('/settings/backup', adminController.createBackup);

// Modular admin API (v2)
router.use('/v2', adminV2Routes);

// Wish management
router.get('/wishes', adminController.getWishes);
router.patch('/wishes/:id', adminController.updateWish);
router.delete('/wishes/:id', adminController.deleteWish);

// Quotes management
router.get('/quotes', adminController.getQuotes);
router.post('/quotes', adminController.createQuote);
router.patch('/quotes/:id', adminController.updateQuote);
router.delete('/quotes/:id', adminController.deleteQuote);

// Feedback messages
router.get('/feedback', adminController.getFeedbackMessages);
router.post('/feedback/:id/archive', adminController.archiveFeedbackMessage);
router.post('/feedback/:id/reply', adminController.replyFeedbackMessage);
router.delete('/feedback/:id', adminController.deleteFeedbackMessage);

// Practice audits
router.get('/practice/gratitude', adminController.getPracticeGratitudeAudit);
router.get('/practice/attendance', adminController.getAttendanceAudit);

// Crystal activity
router.get('/crystal/stats', adminController.getCrystalStats);
router.get('/crystal/locations', adminController.getCrystalLocations);
router.post('/crystal/generate', adminController.forceGenerateCrystals);

// Public route for active quote
router.get('/quotes/active', adminController.getActiveQuote);

module.exports = router;
