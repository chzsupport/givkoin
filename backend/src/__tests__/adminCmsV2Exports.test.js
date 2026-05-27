const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const controller = require('../controllers/adminCmsV2Controller');

const EXPECTED_EXPORTS = [
  'analyticsExport',
  'analyticsOverview',
  'analyticsTopPages',
  'analyticsTrafficSources',
  'applyRiskCasePenalty',
  'articleVersions',
  'banRiskCaseGroup',
  'blockIpRule',
  'campaignDeliveries',
  'clearCache',
  'contentSearch',
  'createArticle',
  'createBackup',
  'createEmailTemplate',
  'createMailCampaign',
  'createModerationRule',
  'createPage',
  'deleteModerationRule',
  'deleteRiskCase',
  'drawLotteryNowCms',
  'emailTemplateVersions',
  'exportFortuneWins',
  'fortuneStatsCms',
  'getAuthEvents',
  'getBackups',
  'getFortuneConfigCms',
  'getIpRules',
  'getRiskCase',
  'getUserSessions',
  'importEmailTemplateDefaults',
  'listArticles',
  'listEmailTemplates',
  'listFortuneWins',
  'listMailCampaigns',
  'listModerationHits',
  'listModerationRules',
  'listPages',
  'listRiskCases',
  'listSystemErrors',
  'pageVersions',
  'patchArticle',
  'patchEmailTemplate',
  'patchFortuneLottery',
  'patchFortuneRoulette',
  'patchModerationRule',
  'patchPage',
  'publishArticle',
  'publishEmailTemplate',
  'publishPage',
  'recomputeRisk',
  'removeRelatedUserFromRiskCase',
  'resolveModerationHit',
  'resolveRiskCase',
  'restoreBackup',
  'revokeAllSessions',
  'revokeUserSession',
  'rollbackArticle',
  'rollbackEmailTemplate',
  'rollbackPage',
  'runMailCampaign',
  'sendRiskCaseContactEmail',
  'sendRiskGroupContactEmail',
  'unblockIpRule',
  'unfreezeRiskCaseGroup',
  'watchRiskCaseGroup',
];

function readAdminCmsRouteSource() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'adminCmsV2.js'),
    'utf8'
  );
}

test('admin CMS v2 controller keeps the public export surface stable', () => {
  assert.deepEqual(Object.keys(controller).sort(), [...EXPECTED_EXPORTS].sort());
  for (const name of EXPECTED_EXPORTS) {
    assert.equal(typeof controller[name], 'function', `${name} must be a function`);
  }
});

test('admin CMS v2 routes use only exported controller handlers', () => {
  const routeSource = readAdminCmsRouteSource();
  const routeHandlers = Array.from(routeSource.matchAll(/controller\.([A-Za-z0-9_]+)/g))
    .map((match) => match[1]);
  const uniqueHandlers = Array.from(new Set(routeHandlers)).sort();

  assert.ok(uniqueHandlers.length > 0, 'admin CMS v2 routes should reference controller handlers');
  for (const name of uniqueHandlers) {
    assert.equal(typeof controller[name], 'function', `${name} is used by the route but is not exported`);
  }
});
