const {
  getActiveUsersThresholdDate,
  getActiveUsersCountSnapshot,
  getUserData,
  getWorldLivingUsersCount,
  isBattleAdminEmail,
  listUsersPage,
  toId,
} = require('./battleUsers');
const { getLatestModelDoc, updateModelDoc } = require('./battleDocuments');
const { computeMissingAttendancePercent } = require('./battleTiming');

const TREE_INJURY_REWARD_DEBUFF_PERCENT = 50;

function pickPriorityInjuryBranchNameFromRows(battle, rows, now = new Date(), { random = Math.random } = {}) {
  const threshold = getActiveUsersThresholdDate(now);
  const thresholdMs = new Date(threshold).getTime();
  const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
  const participantIds = attendance
    .map((row) => (row?.user ? row.user : row))
    .filter(Boolean);

  const excluded = new Set(participantIds.map((v) => toId(v)).filter(Boolean));
  const isRecentEnough = (value) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() >= thresholdMs;
  };

  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    if (excluded.has(id)) continue;
    const data = getUserData(row);

    const status = String(data.status || row.status || '');
    if (status !== 'active') continue;
    const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
    if (!emailConfirmed) continue;
    const role = String(data.role || row.role || '');
    if (role !== 'user') continue;
    if (isBattleAdminEmail(row.email || data.email)) continue;

    const treeBranch = data.treeBranch ? String(data.treeBranch) : null;
    if (!treeBranch) continue;

    const qwPassed = Boolean(data.quietWatchPassed);
    const qwCheckedAt = data.quietWatchCheckedAt ? new Date(data.quietWatchCheckedAt) : null;
    const qwOk = qwPassed || !qwCheckedAt || Number.isNaN(qwCheckedAt.getTime());
    if (!qwOk) continue;

    const recent = isRecentEnough(data.lastOnlineAt || row.last_online_at) || isRecentEnough(data.lastSeenAt || row.last_seen_at);
    if (!recent) continue;

    counts.set(treeBranch, (counts.get(treeBranch) || 0) + 1);
  }

  const entries = Array.from(counts.entries());

  if (!entries.length) return null;
  const maxCount = Math.max(...entries.map(([, c]) => c));
  const top = entries.filter(([, c]) => c === maxCount).map(([b]) => b);
  if (!top.length) return null;
  return top[Math.floor(random() * top.length)];
}

async function pickPriorityInjuryBranchName(battle, now = new Date()) {
  try {
    const rows = [];
    const pageSize = 500;
    let offset = 0;
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const page = await listUsersPage({ from: offset, limit: pageSize });
      if (!page.length) break;
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
    }

    return pickPriorityInjuryBranchNameFromRows(battle, rows, now);
  } catch (e) {
    return null;
  }
}

async function applyBattleInjuryIfNeeded({
  battle,
  patch,
  finalAttendance,
  finalAttendanceCount,
  nextLightDamage,
  nextDarknessDamage,
}) {
  let battleInjury = null;

  const isDraw = nextLightDamage === nextDarknessDamage;
  const darknessWins = nextDarknessDamage > nextLightDamage;

  if (!isDraw && darknessWins) {
    try {
      const activeUsersCount = battle.activeUsersCountSnapshot && battle.activeUsersCountSnapshot > 0
        ? Number(battle.activeUsersCountSnapshot)
        : await getActiveUsersCountSnapshot((patch.endsAt || battle.endsAt) || new Date());

      const missingPercent = computeMissingAttendancePercent({
        attendanceCount: finalAttendanceCount || 0,
        activeUsersCount,
      });

      if (missingPercent > 0) {
        const riskPercent = Math.min(100, missingPercent);
        const roll = Math.random() * 100;
        if (roll < riskPercent) {
          const damageDelta = Math.max(0, nextDarknessDamage - nextLightDamage);
          if (damageDelta > 0) {
            const injurySize = damageDelta * (missingPercent / 100);
            const worldLivingUsersCount = await getWorldLivingUsersCount();
            const effectiveUsers = Math.max(
              1,
              Number(worldLivingUsersCount) || Number(activeUsersCount) || 1,
            );
            const requiredRadiance = Math.round(injurySize * effectiveUsers);
            const debuffPercent = TREE_INJURY_REWARD_DEBUFF_PERCENT;

            const pickedBranchName = await pickPriorityInjuryBranchName(
              { ...battle, attendance: finalAttendance, endsAt: patch.endsAt },
              patch.endsAt || battle.endsAt || new Date(),
            );
            if (pickedBranchName) {
              const injury = {
                branchName: pickedBranchName,
                severityPercent: missingPercent,
                debuffPercent,
                requiredRadiance,
                healedRadiance: 0,
                healedPercent: 0,
                causedAt: new Date(),
              };

              battleInjury = {
                branchName: injury.branchName,
                requiredRadiance: injury.requiredRadiance,
                debuffPercent: injury.debuffPercent,
                causedAt: injury.causedAt,
              };

              const tree = await getLatestModelDoc('Tree');
              if (tree) {
                const injuries = Array.isArray(tree.injuries) ? [...tree.injuries] : [];
                injuries.push(injury);
                await updateModelDoc('Tree', tree._id, { injuries });

                patch.injuries = injuries
                  .filter((inj) => (inj?.healedPercent || 0) < 100)
                  .map((inj) => ({
                    branchName: inj.branchName,
                    requiredRadiance: inj.requiredRadiance,
                    healedRadiance: inj.healedRadiance,
                    debuffPercent: TREE_INJURY_REWARD_DEBUFF_PERCENT,
                  }));
              }
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('finishBattle: injury calculation failed', e);
    }
  }

  return battleInjury;
}

module.exports = {
  applyBattleInjuryIfNeeded,
  pickPriorityInjuryBranchName,
  pickPriorityInjuryBranchNameFromRows,
};
