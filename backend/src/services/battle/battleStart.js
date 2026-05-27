const { getLatestModelDoc } = require('./battleDocuments');
const { buildBattleScenario } = require('./battleScenario');
const { getActiveUsersCountSnapshot } = require('./battleUsers');
const { DEFAULT_DURATION_SECONDS } = require('./battleConfig');

const GLOBAL_DEBUFF_NO_ENTRY_PERCENT = 5;
const TREE_INJURY_REWARD_DEBUFF_PERCENT = 50;

function mapActiveTreeInjurySnapshots(tree) {
  const injuries = Array.isArray(tree?.injuries) ? tree.injuries : [];
  return injuries
    .filter((inj) => (inj?.healedPercent || 0) < 100)
    .map((inj) => ({
      branchName: inj.branchName,
      requiredRadiance: inj.requiredRadiance,
      healedRadiance: inj.healedRadiance,
      debuffPercent: TREE_INJURY_REWARD_DEBUFF_PERCENT,
    }));
}

function buildStartBattleBasePatch(battleId, battle, {
  startsAt,
  durationSeconds,
  durationLocked,
  scheduleSource,
  scheduledIntervalHours,
} = {}) {
  const starts = startsAt ? new Date(startsAt) : new Date();
  const durationSec = durationSeconds ?? battle.durationSeconds ?? DEFAULT_DURATION_SECONDS;
  const scenario = buildBattleScenario({
    _id: battleId,
    startsAt: starts,
    durationSeconds: durationSec,
  });
  const patch = {
    status: 'active',
    startsAt: starts,
    durationSeconds: durationSec,
    endsAt: new Date(starts.getTime() + durationSec * 1000),
    durationLocked: durationLocked === undefined ? Boolean(battle.durationLocked) : Boolean(durationLocked),
    firstPlayerJoinedAt: null,
    globalDebuffActive: true,
    globalDebuffPercent: GLOBAL_DEBUFF_NO_ENTRY_PERCENT,
    scenario,
  };
  if (scheduleSource) {
    patch.scheduleSource = scheduleSource;
  }
  if (scheduledIntervalHours !== undefined) {
    patch.scheduledIntervalHours = scheduledIntervalHours == null ? null : Number(scheduledIntervalHours);
  }
  return { patch, starts };
}

async function buildStartBattlePatch(battleId, battle, options = {}) {
  const { patch, starts } = buildStartBattleBasePatch(battleId, battle, options);

  try {
    const activeUsersCount = await getActiveUsersCountSnapshot(starts);
    patch.activeUsersCountSnapshot = Math.max(0, Number(activeUsersCount) || 0);
  } catch (e) {
    patch.activeUsersCountSnapshot = battle.activeUsersCountSnapshot || 0;
  }

  try {
    const tree = await getLatestModelDoc('Tree');
    patch.injuries = mapActiveTreeInjurySnapshots(tree);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('startBattle: failed to load tree injuries', e);
  }

  return patch;
}

module.exports = {
  buildStartBattleBasePatch,
  buildStartBattlePatch,
  mapActiveTreeInjurySnapshots,
};
