import type { Injury } from './types';

export function getTreeHealingSummary(injuries: Injury[]) {
  const healingSummary = injuries.reduce(
    (acc, injury) => {
      const required = typeof injury.requiredRadiance === 'number' && injury.requiredRadiance > 0
        ? injury.requiredRadiance
        : (injury.severityPercent || 0) * 1000;
      const healed = injury.healedRadiance || 0;
      const percent = required > 0 ? (healed / required) * 100 : (injury.healedPercent || 0);
      if (percent >= 100 || required <= 0) {
        return acc;
      }
      acc.activeCount += 1;
      acc.requiredTotal += required;
      acc.healedTotal += Math.min(required, healed);
      return acc;
    },
    { activeCount: 0, requiredTotal: 0, healedTotal: 0 },
  );

  const hasTrauma = healingSummary.activeCount > 0;
  const healingPercent = healingSummary.requiredTotal > 0
    ? Math.min(100, Math.round((healingSummary.healedTotal / healingSummary.requiredTotal) * 100))
    : 0;
  const healingRemaining = Math.max(0, healingSummary.requiredTotal - healingSummary.healedTotal);

  return {
    hasTrauma,
    healingPercent,
    healingRemaining,
  };
}
