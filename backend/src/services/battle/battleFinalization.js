const { runInBatches } = require('./battleAsync');
const {
  buildFinalizedAttendanceEntry,
  buildLatestFinalReportsMap,
} = require('./battleReports');
const { computeBattleForceTotals } = require('./battleScenario');

async function buildFinalizedAttendanceFromReports({
  runtimeAttendance = [],
  storedAttendance = [],
  runtimeFinalReports = [],
} = {}) {
  const finalReportsByUserId = buildLatestFinalReportsMap(runtimeFinalReports);
  const attendance = Array.isArray(runtimeAttendance) && runtimeAttendance.length
    ? runtimeAttendance
    : (Array.isArray(storedAttendance) ? storedAttendance : []);
  const updatedAttendance = new Array(attendance.length);

  await runInBatches(attendance.map((row, index) => ({ row, index })), 25, async ({ row, index }) => {
    const userId = String(row?.user || '').trim();
    const finalReportState = userId ? finalReportsByUserId.get(userId) || null : null;
    updatedAttendance[index] = buildFinalizedAttendanceEntry(row, finalReportState);
  });

  return updatedAttendance;
}

function computeFinalizedBattleDamageTotals(battle, updatedAttendance = [], actualBattleEndAt = new Date()) {
  const attendance = Array.isArray(updatedAttendance) ? updatedAttendance : [];
  const forceTotals = computeBattleForceTotals(battle, {
    endedAt: actualBattleEndAt,
    baddieDamage: attendance.reduce((sum, row) => sum + (Number(row?.darknessDamageFromBaddies) || 0), 0),
  });
  const totalPlayerDamage = attendance.reduce((sum, row) => sum + (Number(row?.damage) || 0), 0);
  const totalLightDamage = totalPlayerDamage + forceTotals.guardianDamage;
  const totalDarknessDamage = forceTotals.darknessBaseDamage + forceTotals.darknessDamageFromBaddies;

  return {
    forceTotals,
    totalDarknessDamage,
    totalLightDamage,
    totalPlayerDamage,
  };
}

module.exports = {
  buildFinalizedAttendanceFromReports,
  computeFinalizedBattleDamageTotals,
};
