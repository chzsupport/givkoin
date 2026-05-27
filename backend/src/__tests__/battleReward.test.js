const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BATTLE_BASE_REWARD_K,
  computeBattleRewardK,
} = require('../utils/battleReward');

test('battle reward never drops below the base K reward', () => {
  assert.equal(BATTLE_BASE_REWARD_K, 11);
  assert.equal(computeBattleRewardK(), 11);
  assert.equal(computeBattleRewardK({ damage: 0 }), 11);
  assert.equal(computeBattleRewardK({ damage: -5000 }), 11);
});

test('battle reward adds one K per full 1000 damage', () => {
  assert.equal(computeBattleRewardK({ damage: 999 }), 11);
  assert.equal(computeBattleRewardK({ damage: 1000 }), 12);
  assert.equal(computeBattleRewardK({ damage: 2500 }), 13);
});
