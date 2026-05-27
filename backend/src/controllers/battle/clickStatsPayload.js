function sanitizeWorldPoint(raw) {
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    const z = Number(raw?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return { x, y, z };
}

function sanitizeShotTelemetry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const telemetry = {
        intervalMs: Number(raw.intervalMs),
        cursorDistancePx: Number(raw.cursorDistancePx),
        screenNx: Number(raw.screenNx),
        screenNy: Number(raw.screenNy),
        staticCursor: Boolean(raw.staticCursor),
        isTabHidden: Boolean(raw.isTabHidden),
        inputSource: String(raw.inputSource || '').trim().slice(0, 20),
        worldPoint: sanitizeWorldPoint(raw.worldPoint),
    };

    if (!Number.isFinite(telemetry.screenNx) || !Number.isFinite(telemetry.screenNy)) {
        return null;
    }

    telemetry.screenNx = Math.max(0, Math.min(1, telemetry.screenNx));
    telemetry.screenNy = Math.max(0, Math.min(1, telemetry.screenNy));
    telemetry.intervalMs = Number.isFinite(telemetry.intervalMs) ? Math.max(0, telemetry.intervalMs) : 0;
    telemetry.cursorDistancePx = Number.isFinite(telemetry.cursorDistancePx) ? Math.max(0, telemetry.cursorDistancePx) : 0;

    return telemetry;
}

function pickTelemetryMin(prev, next) {
    return Number.isFinite(Number(prev)) ? Math.min(Number(prev), next) : next;
}

function pickTelemetryMax(prev, next) {
    return Number.isFinite(Number(prev)) ? Math.max(Number(prev), next) : next;
}

function buildBattleClickStatsUpdate({ snapshotEntry = null, events = [] }) {
    const safeEvents = Array.isArray(events) ? events : [];
    if (!safeEvents.length) {
        return null;
    }

    const prevAutomationTelemetry = snapshotEntry?.automationTelemetry || {};
    let nextMaxGap = Number(snapshotEntry?.maxClickGapMs) || 0;
    let weapon2Hits = 0;
    let weapon3Hits = 0;
    let shotTelemetryCount = 0;
    let staticCursorShots = 0;
    let hiddenTabShotCount = 0;
    let cursorDistancePxTotal = 0;
    let intervalCount = 0;
    let intervalSumMs = 0;
    let intervalSqSumMs = 0;
    let lastTelemetryAt = prevAutomationTelemetry.lastTelemetryAt ? new Date(prevAutomationTelemetry.lastTelemetryAt) : null;
    let lastInputSource = String(prevAutomationTelemetry.lastInputSource || '');
    let screenMinNx = prevAutomationTelemetry.screenMinNx;
    let screenMaxNx = prevAutomationTelemetry.screenMaxNx;
    let screenMinNy = prevAutomationTelemetry.screenMinNy;
    let screenMaxNy = prevAutomationTelemetry.screenMaxNy;
    let minIntervalMs = prevAutomationTelemetry.minIntervalMs;
    let maxIntervalMs = prevAutomationTelemetry.maxIntervalMs;
    let lastClickAt = snapshotEntry?.lastClickAt ? new Date(snapshotEntry.lastClickAt) : null;

    for (const event of safeEvents) {
        const eventAt = event?.at ? new Date(event.at) : new Date();
        const weapon = Number(event?.weaponId);
        const telemetry = sanitizeShotTelemetry(event?.telemetry);

        if (weapon === 2) weapon2Hits += 1;
        if (weapon === 3) weapon3Hits += 1;

        if (lastClickAt) {
            const gapMs = Math.max(0, eventAt.getTime() - lastClickAt.getTime());
            nextMaxGap = Math.max(nextMaxGap, gapMs);
        }
        lastClickAt = eventAt;

        if (!telemetry) {
            continue;
        }

        shotTelemetryCount += 1;
        staticCursorShots += telemetry.staticCursor ? 1 : 0;
        hiddenTabShotCount += telemetry.isTabHidden ? 1 : 0;
        cursorDistancePxTotal += telemetry.cursorDistancePx;
        lastTelemetryAt = eventAt;
        lastInputSource = telemetry.inputSource || '';
        screenMinNx = pickTelemetryMin(screenMinNx, telemetry.screenNx);
        screenMaxNx = pickTelemetryMax(screenMaxNx, telemetry.screenNx);
        screenMinNy = pickTelemetryMin(screenMinNy, telemetry.screenNy);
        screenMaxNy = pickTelemetryMax(screenMaxNy, telemetry.screenNy);

        if (telemetry.intervalMs > 0) {
            intervalCount += 1;
            intervalSumMs += telemetry.intervalMs;
            intervalSqSumMs += telemetry.intervalMs * telemetry.intervalMs;
            minIntervalMs = pickTelemetryMin(minIntervalMs, telemetry.intervalMs);
            maxIntervalMs = pickTelemetryMax(maxIntervalMs, telemetry.intervalMs);
        }
    }

    const inc = {};
    const set = {};

    if (weapon2Hits > 0) inc['attendance.$.weapon2Hits'] = weapon2Hits;
    if (weapon3Hits > 0) inc['attendance.$.weapon3Hits'] = weapon3Hits;
    if (lastClickAt) {
        set['attendance.$.lastClickAt'] = lastClickAt;
        set['attendance.$.maxClickGapMs'] = nextMaxGap;
    }

    if (shotTelemetryCount > 0) {
        inc['attendance.$.automationTelemetry.shotTelemetryCount'] = shotTelemetryCount;
        inc['attendance.$.automationTelemetry.staticCursorShots'] = staticCursorShots;
        inc['attendance.$.automationTelemetry.hiddenTabShotCount'] = hiddenTabShotCount;
        inc['attendance.$.automationTelemetry.cursorDistancePxTotal'] = cursorDistancePxTotal;
        set['attendance.$.automationTelemetry.lastTelemetryAt'] = lastTelemetryAt || new Date();
        set['attendance.$.automationTelemetry.lastInputSource'] = lastInputSource;
        set['attendance.$.automationTelemetry.screenMinNx'] = screenMinNx;
        set['attendance.$.automationTelemetry.screenMaxNx'] = screenMaxNx;
        set['attendance.$.automationTelemetry.screenMinNy'] = screenMinNy;
        set['attendance.$.automationTelemetry.screenMaxNy'] = screenMaxNy;

        if (intervalCount > 0) {
            inc['attendance.$.automationTelemetry.intervalCount'] = intervalCount;
            inc['attendance.$.automationTelemetry.intervalSumMs'] = intervalSumMs;
            inc['attendance.$.automationTelemetry.intervalSqSumMs'] = intervalSqSumMs;
            set['attendance.$.automationTelemetry.minIntervalMs'] = minIntervalMs;
            set['attendance.$.automationTelemetry.maxIntervalMs'] = maxIntervalMs;
        }
    }

    return { inc, set };
}

module.exports = {
    buildBattleClickStatsUpdate,
    sanitizeShotTelemetry,
    sanitizeWorldPoint,
};
