const BATTLE_BASE_REWARD_K = 11;

function computeBattleRewardK({ damage = 0 } = {}) {
  const safeDamage = Math.max(0, Math.floor(Number(damage) || 0));
  return Math.max(BATTLE_BASE_REWARD_K, BATTLE_BASE_REWARD_K + Math.floor(safeDamage / 1000));
}

module.exports = {
  BATTLE_BASE_REWARD_K,
  computeBattleRewardK,
};

