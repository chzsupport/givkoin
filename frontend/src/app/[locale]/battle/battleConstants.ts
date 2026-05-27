export const COMBO_RESET_MS = 3000;
export const BASE_DOME_CENTER = { x: 0.5, y: 0.57 };
export const BASE_DOME_RADIUS = 0.21;
export const BASE_DOME_VISUAL_SCALE = 1.05;
export const BADDIE_DAMAGE_INTERVAL = 1000;
export const BATTLE_REQUEST_TIMEOUT_MS = 8000;
export const FINAL_REPORT_RETRY_INTERVAL_MS = 2000;
export const FINAL_RESULTS_WAIT_MS = 60000;
export const BATTLE_REPORT_INTERVAL_SECONDS = 60;
export const PERSONAL_STATE_VISIBLE_TICK_MS = 1000;
export const PERSONAL_STATE_HIDDEN_TICK_MS = 5000;
export const SHOT_PREVIEW_TTL_MS = 20000;
export const BATTLE_PROGRESS_STORAGE_PREFIX = 'givkoin_battle_progress';
export const VOICE_COMMAND_SHOOT = '\u0421\u0422\u0420\u0415\u041B\u042F\u0419';
export const VOICE_COMMAND_STOP = '\u0421\u0422\u041E\u0419';
export const WEAPON_CONFIG = {
    1: { damage: 6, costLumens: 10 },
    2: { damage: 500, costLumens: 100 },
    3: { damage: 5000, costLumens: 500 },
} as const;
