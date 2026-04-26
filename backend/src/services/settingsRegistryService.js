const { getSetting, setSetting } = require('../utils/settings');
const { SETTINGS_REGISTRY, normalizeSettingKey } = require('../config/settingsRegistry');

const SETTINGS_CACHE_TTL_MS = 30 * 1000;
const settingsCache = new Map();

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function coerceSettingValue(definition, rawValue) {
  if (!definition) {
    return { ok: false, error: 'Unknown setting definition' };
  }

  if (definition.type === 'number') {
    const numberValue = asNumber(rawValue);
    if (numberValue === null) {
      return { ok: false, error: `Setting ${definition.key} must be a number` };
    }
    return { ok: true, value: numberValue };
  }

  if (definition.type === 'boolean') {
    if (typeof rawValue === 'boolean') return { ok: true, value: rawValue };
    if (rawValue === 'true' || rawValue === '1' || rawValue === 1) return { ok: true, value: true };
    if (rawValue === 'false' || rawValue === '0' || rawValue === 0) return { ok: true, value: false };
    return { ok: false, error: `Setting ${definition.key} must be a boolean` };
  }

  if (definition.type === 'string') {
    return { ok: true, value: String(rawValue ?? '') };
  }

  return { ok: true, value: rawValue };
}

function validateSettingValue(key, rawValue) {
  const normalizedKey = normalizeSettingKey(key);
  const definition = SETTINGS_REGISTRY[normalizedKey];
  if (!definition) {
    return { ok: false, key: normalizedKey, error: `Unknown setting key: ${key}` };
  }

  const coerced = coerceSettingValue(definition, rawValue);
  if (!coerced.ok) {
    return { ok: false, key: normalizedKey, error: coerced.error };
  }

  const value = coerced.value;
  if (definition.type === 'number') {
    if (definition.min !== undefined && value < definition.min) {
      return {
        ok: false,
        key: normalizedKey,
        error: `Setting ${normalizedKey} must be >= ${definition.min}`,
      };
    }
    if (definition.max !== undefined && value > definition.max) {
      return {
        ok: false,
        key: normalizedKey,
        error: `Setting ${normalizedKey} must be <= ${definition.max}`,
      };
    }
  }

  return { ok: true, key: normalizedKey, definition, value };
}

function getCacheEntry(key) {
  const hit = settingsCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SETTINGS_CACHE_TTL_MS) {
    settingsCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCacheEntry(key, value) {
  settingsCache.set(key, { at: Date.now(), value });
}

function invalidateSettingsCache(keys = []) {
  if (!Array.isArray(keys) || keys.length === 0) {
    settingsCache.clear();
    return;
  }
  keys.forEach((key) => settingsCache.delete(normalizeSettingKey(key)));
}

async function getRegistrySettingValue(key) {
  const normalizedKey = normalizeSettingKey(key);
  const definition = SETTINGS_REGISTRY[normalizedKey];
  if (!definition) return null;

  const cached = getCacheEntry(normalizedKey);
  if (cached !== null && cached !== undefined) return cached;

  const fallback = definition.default;
  const rawValue = await getSetting(normalizedKey, fallback);
  const validated = validateSettingValue(normalizedKey, rawValue);
  const finalValue = validated.ok ? validated.value : fallback;
  setCacheEntry(normalizedKey, finalValue);
  return finalValue;
}

async function getNumericSettingValue(key, fallback = 0) {
  const value = await getRegistrySettingValue(key);
  const numeric = asNumber(value);
  if (numeric === null) return fallback;
  return numeric;
}

async function getSettingsDefinitions() {
  return Object.values(SETTINGS_REGISTRY).map((definition) => ({ ...definition }));
}

async function getSettingsValues(keys = null) {
  const selectedKeys = Array.isArray(keys) && keys.length
    ? keys.map((key) => normalizeSettingKey(key))
    : Object.keys(SETTINGS_REGISTRY);

  const uniqueKeys = Array.from(new Set(selectedKeys)).filter((key) => Boolean(SETTINGS_REGISTRY[key]));
  const values = {};
  await Promise.all(uniqueKeys.map(async (key) => {
    values[key] = await getRegistrySettingValue(key);
  }));
  return values;
}

async function updateRegistrySettings(updates, options = {}) {
  const payload = updates && typeof updates === 'object' ? updates : {};
  const entries = Object.entries(payload);
  if (!entries.length) {
    return { updated: [] };
  }

  const normalizedPayload = new Map();
  for (const [key, value] of entries) {
    const normalizedKey = normalizeSettingKey(key);
    normalizedPayload.set(normalizedKey, value);
  }

  const userId = options.userId || null;
  const description = options.description || 'Updated via admin settings registry';
  const results = [];
  const touchedKeys = [];

  for (const [key, value] of normalizedPayload.entries()) {
    const validated = validateSettingValue(key, value);
    if (!validated.ok) {
      const err = new Error(validated.error);
      err.status = 400;
      err.settingKey = key;
      throw err;
    }

    const updated = await setSetting(validated.key, validated.value, description, userId);
    touchedKeys.push(validated.key);
    results.push({
      key: validated.key,
      value: validated.value,
      updatedAt: updated?.updatedAt || null,
    });
  }

  invalidateSettingsCache(touchedKeys);
  return { updated: results };
}

module.exports = {
  validateSettingValue,
  getRegistrySettingValue,
  getNumericSettingValue,
  getSettingsDefinitions,
  getSettingsValues,
  updateRegistrySettings,
  invalidateSettingsCache,
};
