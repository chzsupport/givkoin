 
const quoteController = require('./quoteController');
const adminAccounts = require('./admin/adminAccounts');
const appealsAdmin = require('./admin/appealsAdmin');
const battleAdmin = require('./admin/battleAdmin');
const battleMoodAdmin = require('./admin/battleMoodAdmin');
const contentSettings = require('./admin/contentSettings');
const crystalAdmin = require('./admin/crystalAdmin');
const dashboardStats = require('./admin/dashboardStats');
const entitiesAdmin = require('./admin/entitiesAdmin');
const feedbackMessages = require('./admin/feedbackMessages');
const historyAdmin = require('./admin/historyAdmin');
const practiceAudits = require('./admin/practiceAudits');
const referralsAdmin = require('./admin/referralsAdmin');
const systemSettings = require('./admin/systemSettings');
const tndAdmin = require('./admin/tndAdmin');
const usersAdmin = require('./admin/usersAdmin');
const wishAdmin = require('./admin/wishAdmin');

// Get entities
exports.getEntities = entitiesAdmin.getEntities;

exports.getAdmins = adminAccounts.getAdmins;
exports.createAdmin = adminAccounts.createAdmin;
exports.updateAdminEmail = adminAccounts.updateAdminEmail;

// Update entity avatar
exports.updateEntityAvatar = entitiesAdmin.updateEntityAvatar;

// Delete entity
exports.deleteEntity = entitiesAdmin.deleteEntity;

// Get referrals
exports.getReferrals = referralsAdmin.getReferrals;

exports.getTndStats = tndAdmin.getTndStats;

// User management
exports.getUsers = usersAdmin.getUsers;
exports.getUserById = usersAdmin.getUserById;
exports.updateUser = usersAdmin.updateUser;
exports.deleteUser = usersAdmin.deleteUser;
exports.resetUserPassword = usersAdmin.resetUserPassword;

// Appeals
exports.getAppeals = appealsAdmin.getAppeals;
exports.handleAppeal = appealsAdmin.handleAppeal;

// Get stats
exports.getStats = dashboardStats.getStats;

// Audit Logs
exports.getAuditLogs = historyAdmin.getAuditLogs;

// Chat History
exports.getChatHistory = historyAdmin.getChatHistory;

// Battle History
exports.getBattleHistory = historyAdmin.getBattleHistory;

exports.getBattleControl = battleAdmin.getBattleControl;

exports.getBattleMoodForecast = battleMoodAdmin.getBattleMoodForecast;

exports.getSuspiciousBattleUsers = battleAdmin.getSuspiciousBattleUsers;

exports.startBattleNow = battleAdmin.startBattleNow;
exports.scheduleBattle = battleAdmin.scheduleBattle;
exports.cancelScheduledBattle = battleAdmin.cancelScheduledBattle;
exports.clearUpcomingBattle = battleAdmin.clearUpcomingBattle;
exports.finishBattleNow = battleAdmin.finishBattleNow;

// Settings
exports.getSettings = systemSettings.getSettings;
exports.updateSettings = systemSettings.updateSettings;

// Backup
exports.createBackup = systemSettings.createBackup;

// Collective Meditation Schedule
exports.getCollectiveMeditationSettings = systemSettings.getCollectiveMeditationSettings;
exports.updateCollectiveMeditationSettings = systemSettings.updateCollectiveMeditationSettings;

// Wish management
exports.getWishes = wishAdmin.getWishes;
exports.updateWish = wishAdmin.updateWish;
exports.deleteWish = wishAdmin.deleteWish;
// Rules and page content
exports.getRules = contentSettings.getRules;
exports.updateRules = contentSettings.updateRules;
exports.getPagesContent = contentSettings.getPagesContent;
exports.updatePagesContent = contentSettings.updatePagesContent;

// Ad Settings
exports.getAdSettings = contentSettings.getAdSettings;
exports.updateAdSettings = contentSettings.updateAdSettings;

// Quotes management
exports.getQuotes = quoteController.getAllQuotes;

// Feedback messages
exports.getFeedbackMessages = feedbackMessages.getFeedbackMessages;
exports.archiveFeedbackMessage = feedbackMessages.archiveFeedbackMessage;
exports.replyFeedbackMessage = feedbackMessages.replyFeedbackMessage;
exports.deleteFeedbackMessage = feedbackMessages.deleteFeedbackMessage;

exports.createQuote = quoteController.createQuote;
exports.updateQuote = quoteController.updateQuote;
exports.deleteQuote = quoteController.deleteQuote;

// Get active quote for the day (public)
exports.getActiveQuote = quoteController.getActiveQuote;
// Feedback messages handlers... (already exist)

// Crystal activity
exports.getCrystalStats = crystalAdmin.getCrystalStats;
exports.getCrystalLocations = crystalAdmin.getCrystalLocations;
exports.forceGenerateCrystals = crystalAdmin.forceGenerateCrystals;

exports.getPracticeGratitudeAudit = practiceAudits.getPracticeGratitudeAudit;
exports.getAttendanceAudit = practiceAudits.getAttendanceAudit;

