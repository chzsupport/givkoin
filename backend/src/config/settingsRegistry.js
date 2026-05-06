const SETTINGS_REGISTRY = {
  CHAT_K_PER_HOUR: {
    key: 'CHAT_K_PER_HOUR',
    type: 'number',
    min: 1,
    max: 500,
    default: 12,
    label: 'K за час общения',
    appliesTo: ['chat_rewards'],
  },
  CHAT_MINUTES_PER_DAY_CAP: {
    key: 'CHAT_MINUTES_PER_DAY_CAP',
    type: 'number',
    min: 60,
    max: 1440,
    default: 600,
    label: 'Лимит минут чата в день',
    appliesTo: ['chat_rewards'],
  },
  INITIAL_LIVES: {
    key: 'INITIAL_LIVES',
    type: 'number',
    min: 1,
    max: 50,
    default: 5,
    label: 'Стартовые жизни',
    appliesTo: ['registration', 'user_defaults'],
  },
  K_APPEAL_COMPENSATION: {
    key: 'K_APPEAL_COMPENSATION',
    type: 'number',
    min: 0,
    max: 5000,
    default: 100,
    label: 'Компенсация за отменённую жалобу (K)',
    appliesTo: ['appeals', 'moderation'],
  },
};

const SETTINGS_ALIASES = {
  K_PER_HOUR_CHAT: 'CHAT_K_PER_HOUR',
};

function normalizeSettingKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  return SETTINGS_ALIASES[raw] || raw;
}

module.exports = {
  SETTINGS_REGISTRY,
  SETTINGS_ALIASES,
  normalizeSettingKey,
};

