const path = require('path');

function installMock(moduleRelativePath, exportsObject) {
  const modulePath = require.resolve(moduleRelativePath);
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsObject,
  };
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { createMockSupabaseStore } = require('../testUtils/mockSupabaseStore');
  const mockStore = createMockSupabaseStore();

  installMock(path.join(__dirname, '../src/lib/supabaseStore'), mockStore);
  installMock(path.join(__dirname, '../src/services/adminActionService'), {
    logAdminAction: async () => ({ actionLogId: 'script_audit' }),
  });

  const RiskCase = require('../src/models/RiskCase');
  const AutomationPenalty = require('../src/models/AutomationPenalty');
  const Transaction = require('../src/models/Transaction');
  const controller = require('../src/controllers/adminCmsV2Controller');
  const { recomputeRiskCases } = require('../src/services/automationRiskService');
  const {
    seedLegitTimerUserScenario,
    seedSuspiciousAutomationClusterScenario,
  } = require('../testUtils/automationScenarioFactory');

  const createRes = () => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    return res;
  };

  console.log('[automation-verify] Scenario 1: legit timer-only user');
  mockStore.__reset();
  const legit = await seedLegitTimerUserScenario({ baseNow: new Date('2026-03-07T12:00:00.000Z') });
  await recomputeRiskCases();
  const legitCase = await RiskCase.findOne({ user: legit.user._id }).lean();
  ensure(legitCase, 'Legit risk case was not created');
  ensure(Number(legitCase.riskScore) === 0, `Legit user riskScore expected 0, got ${legitCase.riskScore}`);
  ensure(String(legitCase.status) === 'resolved', `Legit user status expected resolved, got ${legitCase.status}`);
  console.log(`[automation-verify] Legit user OK -> riskScore=${legitCase.riskScore}, status=${legitCase.status}`);

  console.log('[automation-verify] Scenario 2: suspicious automation cluster + admin penalty');
  mockStore.__reset();
  const suspicious = await seedSuspiciousAutomationClusterScenario({ baseNow: new Date('2026-03-07T12:00:00.000Z') });
  const recompute = await recomputeRiskCases();
  const mainCase = await RiskCase.findOne({ user: suspicious.mainUser._id }).lean();
  ensure(recompute.flagged >= 3, `Expected >= 3 flagged users, got ${recompute.flagged}`);
  ensure(mainCase, 'Suspicious main risk case missing');
  ensure(mainCase.riskScore >= 90, `Suspicious riskScore expected >= 90, got ${mainCase.riskScore}`);

  const requiredSignals = [
    'direct_navigation_bias',
    'skipped_navigation_chain',
    'profit_without_exploration',
    'request_action_cadence',
    'activity_after_session_revoke',
    'battle_static_cursor',
    'benefit_funneling_receiver',
    'navigation_pattern_cluster',
    'progress_structure_cluster',
    'battle_signature_cluster',
  ];
  for (const signal of requiredSignals) {
    ensure(mainCase.signals.includes(signal), `Missing required signal: ${signal}`);
  }
  console.log(`[automation-verify] Suspicious user flagged -> riskScore=${mainCase.riskScore}, signals=${mainCase.signals.length}`);

  const penaltyReq = {
    params: { id: String(mainCase._id) },
    body: { penaltyPercent: 80, reason: 'script verification' },
    user: { _id: 'admin-script' },
  };
  const penaltyRes = createRes();
  await controller.applyRiskCasePenalty(penaltyReq, penaltyRes);
  ensure(penaltyRes.body?.status === 'executed', 'Penalty controller did not return executed status');

  const penalizedCase = await RiskCase.findById(mainCase._id).lean();
  const penaltyLedger = await AutomationPenalty.findOne({ riskCase: mainCase._id }).lean();
  const adminDebits = await Transaction.find({
    user: suspicious.mainUser._id,
    type: 'admin',
    direction: 'debit',
  }).lean();

  ensure(penalizedCase?.status === 'penalized', `Expected penalized status, got ${penalizedCase?.status}`);
  ensure(Boolean(penaltyLedger), 'Penalty ledger was not created');
  ensure(Array.isArray(adminDebits) && adminDebits.length >= 2, `Expected >= 2 admin debit transactions, got ${adminDebits?.length || 0}`);
  console.log(
    `[automation-verify] Penalty OK -> confiscated K=${penalizedCase.penalty.confiscatedK}, LM=${penalizedCase.penalty.confiscatedLumens}`
  );

  console.log('[automation-verify] All automation verification scenarios passed');
}

main().catch((error) => {
  console.error('[automation-verify] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

