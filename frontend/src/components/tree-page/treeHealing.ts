import type { Injury } from './types';

const LUMEN_TO_RADIANCE = 4;

function getRequiredRadiance(injury: Injury) {
  const required = Number(injury.requiredRadiance);
  if (Number.isFinite(required) && required > 0) return required;
  return Math.max(0, (Number(injury.severityPercent) || 0) * 1000);
}

function getHealedRadiance(injury: Injury, required: number) {
  const healed = Number(injury.healedRadiance);
  if (Number.isFinite(healed) && healed >= 0) return healed;
  const percent = Math.max(0, Number(injury.healedPercent) || 0);
  return required > 0 ? (required * percent) / 100 : 0;
}

export function applyOptimisticHealing(injuries: Injury[], lumens: number) {
  let remainingRadiance = Math.max(0, lumens * LUMEN_TO_RADIANCE);

  return injuries
    .map((injury) => {
      const required = getRequiredRadiance(injury);
      if (required <= 0) return injury;

      const healed = Math.min(required, getHealedRadiance(injury, required));
      const need = Math.max(0, required - healed);
      if (need <= 0 || remainingRadiance <= 0) return injury;

      const portion = Math.min(need, remainingRadiance);
      remainingRadiance -= portion;

      const nextHealed = Math.min(required, healed + portion);
      const nextPercent = Math.min(100, (nextHealed / required) * 100);

      return {
        ...injury,
        requiredRadiance: required,
        healedRadiance: nextHealed,
        healedPercent: nextPercent,
        debuffPercent: nextPercent >= 100 ? 0 : injury.debuffPercent,
      };
    })
    .filter((injury) => {
      const required = getRequiredRadiance(injury);
      if (required <= 0) return true;
      const healed = getHealedRadiance(injury, required);
      const percent = required > 0 ? (healed / required) * 100 : (Number(injury.healedPercent) || 0);
      return percent < 100;
    });
}
