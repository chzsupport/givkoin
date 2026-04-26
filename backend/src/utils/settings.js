const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const SETTINGS_CACHE_TTL_MS = Math.max(0, Number(process.env.SETTINGS_CACHE_TTL_MS) || 30_000);
const settingsCache = new Map();

async function findSettingByKey(key) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', 'Settings')
        .limit(500);
    if (error || !Array.isArray(data)) return null;
    return data.find((row) => row.data?.key === key) || null;
}

async function upsertSetting(id, data) {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    
    if (id) {
        await supabase
            .from(DOC_TABLE)
            .update({ data, updated_at: nowIso })
            .eq('id', id);
        return { ...data, _id: id };
    }
    
    const newId = `set_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    await supabase.from(DOC_TABLE).insert({
        model: 'Settings',
        id: newId,
        data,
        created_at: nowIso,
        updated_at: nowIso,
    });
    return { ...data, _id: newId };
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
