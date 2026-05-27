import type { BattleSummary } from '@/lib/battleSummary';

export const INTRO_TYPE_DELAY_MS = 334;
export const INTRO_TYPE_STEP = 3;
export const LINE_REVEAL_DELAY_MS = 850;
export const LINE_LABEL_TYPE_DELAY_MS = 52;
export const LINE_LABEL_TYPE_STEP = 4;

export const DISPLAY_LINE_ORDER = [
  'user_damage',
  'reward_k',
  'duration',
  'best_player',
  'achievements',
  'total_dark_damage',
  'total_light_damage',
] as const;

export const RESULT_LABEL_KEYS: Record<NonNullable<BattleSummary['result']>, 'battle_summary.result_victory' | 'battle_summary.result_defeat' | 'battle_summary.result_draw'> = {
  light: 'battle_summary.result_victory',
  dark: 'battle_summary.result_defeat',
  draw: 'battle_summary.result_draw',
};
