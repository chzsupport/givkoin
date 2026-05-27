function deepClone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function setByPath(target, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cur = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
        cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
}

function applyAttendanceUpdate(entry, payload = {}) {
    const next = deepClone(entry) || {};
    const prefix = 'attendance.$.';
    for (const [path, delta] of Object.entries(payload.$inc || {})) {
        const raw = String(path || '');
        if (!raw.startsWith(prefix)) continue;
        const key = raw.slice(prefix.length);
        next[key] = (Number(next[key]) || 0) + (Number(delta) || 0);
    }
    for (const [path, value] of Object.entries(payload.$set || {})) {
        const raw = String(path || '');
        if (!raw.startsWith(prefix)) continue;
        setByPath(next, raw.slice(prefix.length), value);
    }
    for (const [path, value] of Object.entries(payload.$addToSet || {})) {
        const raw = String(path || '');
        if (!raw.startsWith(prefix)) continue;
        const key = raw.slice(prefix.length);
        const current = Array.isArray(next[key]) ? [...next[key]] : [];
        const toAdd = value && typeof value === 'object' && Array.isArray(value.$each) ? value.$each : [value];
        for (const item of toAdd) {
            if (item === undefined) continue;
            if (!current.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) {
                current.push(item);
            }
        }
        next[key] = current;
    }
    return next;
}

function createBattleAttendanceDocumentUpdater({ getBattleDocById, updateBattleDocById }) {
    async function applyBattleAttendanceUpdateByUser({ battleId, userId, payload }) {
        if (!battleId || !userId || !payload) return null;
        const battle = await getBattleDocById(battleId);
        if (!battle) return null;
        const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
        const idx = attendance.findIndex((row) => String(row?.user || '') === String(userId));
        if (idx < 0) return null;

        const nextBattle = { ...battle, attendance };

        for (const [path, delta] of Object.entries(payload.$inc || {})) {
            const raw = String(path || '');
            if (raw.startsWith('attendance.$.')) continue;
            nextBattle[raw] = (Number(nextBattle[raw]) || 0) + (Number(delta) || 0);
        }
        for (const [path, value] of Object.entries(payload.$set || {})) {
            const raw = String(path || '');
            if (raw.startsWith('attendance.$.')) continue;
            setByPath(nextBattle, raw, value);
        }
        nextBattle.attendance[idx] = applyAttendanceUpdate(nextBattle.attendance[idx] || {}, payload);
        const saved = await updateBattleDocById(battleId, nextBattle);
        return saved || nextBattle;
    }

    return {
        applyBattleAttendanceUpdateByUser,
    };
}

module.exports = {
    applyAttendanceUpdate,
    createBattleAttendanceDocumentUpdater,
    deepClone,
    setByPath,
};
