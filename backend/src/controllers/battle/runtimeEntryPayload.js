const ATTENDANCE_PATH_PREFIX = 'attendance.$.';

function cloneRuntimeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return JSON.parse(JSON.stringify(entry));
}

function normalizeAttendanceRuntimePath(path) {
    return String(path || '').replace(ATTENDANCE_PATH_PREFIX, '').trim();
}

function getRuntimeEntryValue(target, path) {
    const segments = normalizeAttendanceRuntimePath(path).split('.').filter(Boolean);
    let current = target;
    for (const segment of segments) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[segment];
    }
    return current;
}

function setRuntimeEntryValue(target, path, value) {
    const segments = normalizeAttendanceRuntimePath(path).split('.').filter(Boolean);
    if (!segments.length) return;
    let current = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
            current[segment] = {};
        }
        current = current[segment];
    }
    current[segments[segments.length - 1]] = value;
}

function applyAttendancePayloadToRuntimeEntry(entry, payload = {}) {
    const nextEntry = cloneRuntimeEntry(entry) || {};

    for (const [path, delta] of Object.entries(payload.$inc || {})) {
        const currentValue = Number(getRuntimeEntryValue(nextEntry, path)) || 0;
        const nextValue = currentValue + (Number(delta) || 0);
        setRuntimeEntryValue(nextEntry, path, nextValue);
    }

    for (const [path, value] of Object.entries(payload.$set || {})) {
        setRuntimeEntryValue(nextEntry, path, value);
    }

    return nextEntry;
}

function mergeUpdatePayload(target, source = {}) {
    if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
        return target;
    }

    if (source.$inc && typeof source.$inc === 'object') {
        target.$inc = target.$inc || {};
        for (const [path, delta] of Object.entries(source.$inc)) {
            target.$inc[path] = (Number(target.$inc[path]) || 0) + (Number(delta) || 0);
        }
        if (!Object.keys(target.$inc).length) delete target.$inc;
    }

    if (source.$set && typeof source.$set === 'object' && Object.keys(source.$set).length > 0) {
        target.$set = {
            ...(target.$set || {}),
            ...source.$set,
        };
    }

    return target;
}

module.exports = {
    applyAttendancePayloadToRuntimeEntry,
    cloneRuntimeEntry,
    getRuntimeEntryValue,
    mergeUpdatePayload,
    normalizeAttendanceRuntimePath,
    setRuntimeEntryValue,
};
