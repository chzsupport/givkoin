import type { HumanCheckVariant } from './types';

export const POLL_INTERVAL_MS = 60 * 1000;
export const CATCH_MOVE_INTERVAL_MS = 1300;
export const CATCH_ORB_STIFFNESS = 77;

export const VARIANT_LABEL_KEYS: Record<HumanCheckVariant, string> = {
  hold: 'human_check.variant_hold',
  slider: 'human_check.variant_slider',
  order: 'human_check.variant_order',
  rotate: 'human_check.variant_rotate',
  catch: 'human_check.variant_catch',
};
