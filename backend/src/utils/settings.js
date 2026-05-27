const { insertDoc, listDocsByModel, updateDoc } = require('../services/documentStore');

const SETTINGS_CACHE_TTL_MS = Math.max(0, Number(process.env.SETTINGS_CACHE_TTL_MS) || 30_000);
const settingsCache = new Map();

async function findSettingByKey(key) {
    const settings = await listDocsByModel('Settings', { limit: 500 });
    const setting = settings.find((row) => row?.key === key) || null;
    if (!setting) return null;
    return {
        id: setting._id,
        data: {
            key: setting.key,
            value: setting.value,
            description: setting.description,
            updatedBy: setting.updatedBy
        }
    };
}

async function upsertSetting(id, data) {
    if (id) {
        const updated = await updateDoc(id, data);
        return { ...data, _id: updated?._id || id };
    }
    
    const newId = `set_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const inserted = await insertDoc({ id: newId, model: 'Settings', data });
    return { ...data, _id: inserted?._id || newId };
}

/**
 * Gets a setting value by key.
 * Falls back to process.env if not found in DB.
 */
const getSetting = async (key, defaultValue = null) => {
    try {
        if (SETTINGS_CACHE_TTL_MS > 0) {
            const cached = settingsCache.get(key);
            if (cached && Date.now() - cached.atMs < SETTINGS_CACHE_TTL_MS) {
                return cached.value;
            }
        }

        const setting = await findSettingByKey(key);
        if (setting) {
            if (SETTINGS_CACHE_TTL_MS > 0) {
                settingsCache.set(key, { value: setting.data.value, atMs: Date.now() });
            }
            return setting.data.value;
        }

        // Fallback to env
        if (process.env[key] !== undefined) {
            const envVal = process.env[key];
            // Try to parse as number if it looks like one
            const resolved = (!isNaN(envVal) && envVal.trim() !== '') ? Number(envVal) : envVal;
            if (SETTINGS_CACHE_TTL_MS > 0) {
                settingsCache.set(key, { value: resolved, atMs: Date.now() });
            }
            return resolved;
        }

        if (SETTINGS_CACHE_TTL_MS > 0) {
            settingsCache.set(key, { value: defaultValue, atMs: Date.now() });
        }
        return defaultValue;
    } catch (error) {
        console.error(`Error fetching setting ${key}:`, error);
        return defaultValue;
    }
};

/**
 * Updates or creates a setting.
 */
const setSetting = async (key, value, description = '', userId = null) => {
    try {
        const existing = await findSettingByKey(key);
        const data = { key, value, description, updatedBy: userId };
        const doc = await upsertSetting(existing?.id || null, data);
        if (SETTINGS_CACHE_TTL_MS > 0) {
            settingsCache.set(key, { value: doc.value, atMs: Date.now() });
        }
        return doc;
    } catch (error) {
        console.error(`Error setting ${key}:`, error);
        throw error;
    }
};

module.exports = {
    getSetting,
    setSetting
};
