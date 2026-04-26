const express = require('express');
const controller = require('../controllers/adminCmsV2Controller');

const router = express.Router();

// Security
router.get('/security/risk-cases', controller.listRiskCases);
router.get('/security/risk-cases/:id', controller.getRiskCase);
router.post('/security/risk-cases/recompute', controller.recomputeRisk);
router.post('/security/risk-cases/:id/penalize', controller.applyRiskCasePenalty);
router.post('/security/risk-cases/:id/resolve', controller.resolveRiskCase);
router.post('/security/risk-cases/:id/unfreeze-group', controller.unfreezeRiskCaseGroup);
router.post('/security/risk-cases/:id/watch-group', controller.watchRiskCaseGroup);
router.post('/security/risk-cases/:id/ban-group', controller.banRiskCaseGroup);
router.delete('/security/risk-cases/:id', controller.deleteRiskCase);
router.delete('/security/risk-cases/:id/users/:userId', controller.removeRelatedUserFromRiskCase);
router.post('/security/risk-cases/:id/contact', controller.sendRiskCaseContactEmail);
router.post('/security/risk-groups/contact', controller.sendRiskGroupContactEmail);
router.get('/security/ip-rules', controller.getIpRules);
router.post('/security/ip-rules/block', controller.blockIpRule);
router.post('/security/ip-rules/unblock', controller.unblockIpRule);

// Auth events and sessions
router.get('/auth/events', controller.getAuthEvents);
router.get('/users/:id/sessions', controller.getUserSessions);
router.post('/sessions/:sessionId/revoke', controller.revokeUserSession);
router.post('/users/:id/sessions/revoke-all', controller.revokeAllSessions);

// Moderation
router.get('/moderation/rules', controller.listModerationRules);
router.post('/moderation/rules', controller.createModerationRule);
router.patch('/moderation/rules/:id', controller.patchModerationRule);
router.delete('/moderation/rules/:id', controller.deleteModerationRule);
router.get('/moderation/hits', controller.listModerationHits);
router.post('/moderation/hits/:id/resolve', controller.resolveModerationHit);

// CMS content: pages
router.get('/content/pages', controller.listPages);
router.post('/content/pages', controller.createPage);
router.patch('/content/pages/:id', controller.patchPage);
router.post('/content/pages/:id/publish', controller.publishPage);
router.get('/content/pages/:id/versions', controller.pageVersions);
router.post('/content/pages/:id/rollback/:version', controller.rollbackPage);

// CMS content: articles
router.get('/content/articles', controller.listArticles);
router.post('/content/articles', controller.createArticle);
router.patch('/content/articles/:id', controller.patchArticle);
router.post('/content/articles/:id/publish', controller.publishArticle);
router.get('/content/articles/:id/versions', controller.articleVersions);
router.post('/content/articles/:id/rollback/:version', controller.rollbackArticle);

router.get('/content/search', controller.contentSearch);

// Analytics
router.get('/analytics/overview', controller.analyticsOverview);
router.get('/analytics/top-pages', controller.analyticsTopPages);
router.get('/analytics/traffic-sources', controller.analyticsTrafficSources);
router.get('/analytics/export', controller.analyticsExport);

// Fortune
router.get('/fortune/config', controller.getFortuneConfigCms);
router.patch('/fortune/config/roulette', controller.patchFortuneRoulette);
router.patch('/fortune/config/lottery', controller.patchFortuneLottery);
router.get('/fortune/stats', controller.fortuneStatsCms);
router.get('/fortune/wins', controller.listFortuneWins);
router.get('/fortune/wins/export', controller.exportFortuneWins);
router.post('/fortune/lottery/draw-now', controller.drawLotteryNowCms);

// System
router.get('/system/backups', controller.getBackups);
router.post('/system/backups/create', controller.createBackup);
router.post('/system/backups/restore', controller.restoreBackup);
router.post('/system/cache/clear', controller.clearCache);
router.get('/system/errors', controller.listSystemErrors);

// Mail
router.get('/mail/campaigns', controller.listMailCampaigns);
router.post('/mail/campaigns', controller.createMailCampaign);
router.post('/mail/campaigns/:id/run', controller.runMailCampaign);
router.get('/mail/campaigns/:id/deliveries', controller.campaignDeliveries);

// Email templates
router.get('/mail/templates', controller.listEmailTemplates);
router.post('/mail/templates', controller.createEmailTemplate);
router.post('/mail/templates/import-defaults', controller.importEmailTemplateDefaults);
router.patch('/mail/templates/:id', controller.patchEmailTemplate);
router.post('/mail/templates/:id/publish', controller.publishEmailTemplate);
router.get('/mail/templates/:id/versions', controller.emailTemplateVersions);
router.post('/mail/templates/:id/rollback/:version', controller.rollbackEmailTemplate);

module.exports = router;
