const { getSupabaseClient } = require('../../lib/supabaseClient');

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,data')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

function buildUserRowFromRequestUser(user) {
    const userId = String(user?._id || user?.id || '').trim();
    if (!userId) return null;
    const data = user?.data && typeof user.data === 'object'
        ? user.data
        : user;
    return {
        id: userId,
        data,
    };
}

function buildBattleResourceSnapshot(userData) {
    const data = userData && typeof userData === 'object' ? userData : {};
    return {
        lumensAtBattleStart: Number(data.lumens) || 0,
        kAtBattleStart: Number(data.k) || 0,
        starsAtBattleStart: Number(data.stars) || 0,
    };
}

function setDeepValue(obj, path, value) {
    if (!obj || typeof obj !== 'object') return;
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
}

async function updateUserDataById(userId, patch, { userRow = null } = {}) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const row = userRow || await getUserRowById(userId);
    if (!row) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataByIdDeepPatch(userId, changes = {}, { userRow = null } = {}) {
    if (!userId || !changes || typeof changes !== 'object') return null;
    const row = userRow || await getUserRowById(userId);
    if (!row) return null;
    const existing = getUserData(row);
    const next = { ...existing };
    for (const [path, value] of Object.entries(changes)) {
        setDeepValue(next, path, value);
    }
    return updateUserDataById(userId, next, { userRow: row });
}

function readDeepValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return obj;
    let cursor = obj;
    for (const key of parts) {
        if (!cursor || typeof cursor !== 'object') return undefined;
        cursor = cursor[key];
    }
    return cursor;
}

function isBoostActiveForBattle(boost, battleId) {
    if (!boost) return false;
    if (boost.pending) return true;
    if (!boost.battleId) return false;
    return boost.battleId.toString() === battleId.toString();
}

const BATTLE_BOOST_PATHS = Object.freeze([
    'shopBoosts.battleDamage',
    'shopBoosts.battleLumensDiscount',
    'shopBoosts.weakZoneDamage',
]);

async function bindPendingBattleBoosts(userId, battleId, at, { userRow = null } = {}) {
    const now = at || new Date();
    const row = userRow || await getUserRowById(userId);
    if (!row) return {};

    const data = getUserData(row);
    const updates = {};
    let hasUpdates = false;

    for (const path of BATTLE_BOOST_PATHS) {
        const pending = Boolean(readDeepValue(data, `${path}.pending`));
        if (!pending) continue;
        updates[`${path}.pending`] = false;
        updates[`${path}.battleId`] = String(battleId);
        updates[`${path}.activatedAt`] = now.toISOString();
        hasUpdates = true;
    }

    if (!hasUpdates) {
        return data.shopBoosts && typeof data.shopBoosts === 'object'
            ? data.shopBoosts
            : {};
    }

    const updatedRow = await updateUserDataByIdDeepPatch(userId, updates, { userRow: row });
    const updatedData = updatedRow ? getUserData(updatedRow) : data;
    return updatedData.shopBoosts && typeof updatedData.shopBoosts === 'object'
        ? updatedData.shopBoosts
        : {};
}

module.exports = {
    bindPendingBattleBoosts,
    buildBattleResourceSnapshot,
    buildUserRowFromRequestUser,
    getUserData,
    getUserRowById,
    isBoostActiveForBattle,
    readDeepValue,
    setDeepValue,
    updateUserDataByIdDeepPatch,
};
