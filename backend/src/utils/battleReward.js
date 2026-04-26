const BATTLE_BASE_REWARD_SC = 11;

function computeBattleRewardSc({ damage = 0 } = {}) {
  const safeDamage = Math.max(0, Math.floor(Number(damage) || 0));
  return Math.max(BATTLE_BASE_REWARD_SC, BATTLE_BASE_REWARD_SC + Math.floor(safeDamage / 1000));
}

module.exports = {
  BATTLE_BASE_REWARD_SC,
  computeBattleRewardSc,
};

