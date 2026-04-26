export type BoostType =
  | 'solar_charge'
  | 'roulette_extra_spin'
  | 'roulette_double_rewards'
  | 'gratitude_bonus'
  | 'night_shift_double'
  | 'collect_shards_double'
  | 'shop_random_item'
  | 'inventory_enhance'
  | 'battle_bonus_k'
  | 'lottery_free_ticket'
  | 'attendance_random_reward'
  | 'fruit_double'
  | 'tree_blessing_double';

export interface BoostOffer {
  id: string;
  type: BoostType;
  label: string;
  description: string;
  rewardText: string;
  onReward: () => void;
}

export type BoostPhase = 'idle' | 'banner' | 'video' | 'rewarded';
