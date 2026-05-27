const BATTLE_REPORT_EARLY_GRACE_MS = 1500;

function cloneRuntimeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return JSON.parse(JSON.stringify(entry));
}

function createEmptyBattleReportedState(intervalSeconds = 60) {
    const safeIntervalSeconds = Math.max(1, Math.floor(Number(intervalSeconds) || 60));
    return {
        intervalSeconds: safeIntervalSeconds,
        shotsByWeapon: { 1: 0, 2: 0, 3: 0 },
        hitsByWeapon: { 1: 0, 2: 0, 3: 0 },
        hits: 0,
        damage: 0,
        damageDelta: 0,
        totalShots: 0,
        totalHits: 0,
        lumensSpent: 0,
        lumensGained: 0,
        crystalsCollected: 0,
        sparkIds: [],
        weakZoneHitsById: {},
        voiceResults: [],
        baddieDestroyedIds: [],
        baddieDamage: 0,
        maxComboHits: 0,
        maxComboMultiplier: 1,
        heldComboX2MaxDuration: 0,
        reachedX1_5InFirst30s: false,
        phoenixStage: 0,
        lumensSpentWeapon3First2Min: 0,
        lumensSpentOtherFirst2Min: 0,
        damageAfterZeroLumens: 0,
    };
}

function normalizeUniqueBattleIds(value, { limit = 2000 } = {}) {
    return Array.from(
        new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)),
    ).slice(0, limit);
}

function normalizeBattleCountMap(value, { limit = 1000 } = {}) {
    if (!value || typeof value !== 'object') return {};
    const out = {};
    let used = 0;
    for (const [rawKey, rawValue] of Object.entries(value)) {
        if (used >= limit) break;
        const key = String(rawKey || '').trim();
        if (!key) continue;
        const count = Math.max(0, Math.floor(Number(rawValue) || 0));
        if (!count) continue;
        out[key] = count;
        used += 1;
    }
    return out;
}

function normalizeBattleVoiceResults(value, { limit = 1000 } = {}) {
    return (Array.isArray(value) ? value : [])
        .map((row) => ({
            id: String(row?.id || '').trim(),
            text: String(row?.text || '').trim() === 'СТОЙ' ? 'СТОЙ' : 'СТРЕЛЯЙ',
            acted: Boolean(row?.acted),
            success: Boolean(row?.success),
        }))
        .filter((row) => Boolean(row.id))
        .slice(0, limit);
}

function normalizeBattleReport(report, intervalSeconds = 60) {
    const safeReport = report && typeof report === 'object' ? report : {};
    const shotsByWeapon = safeReport.shotsByWeapon && typeof safeReport.shotsByWeapon === 'object'
        ? safeReport.shotsByWeapon
        : {};
    const hitsByWeaponRaw = safeReport.hitsByWeapon && typeof safeReport.hitsByWeapon === 'object'
        ? safeReport.hitsByWeapon
        : {};

    const normalized = createEmptyBattleReportedState(
        Number(safeReport.intervalSeconds) || intervalSeconds,
    );

    normalized.shotsByWeapon = {
        1: Math.max(0, Math.floor(Number(shotsByWeapon[1] ?? shotsByWeapon.weapon1) || 0)),
        2: Math.max(0, Math.floor(Number(shotsByWeapon[2] ?? shotsByWeapon.weapon2) || 0)),
        3: Math.max(0, Math.floor(Number(shotsByWeapon[3] ?? shotsByWeapon.weapon3) || 0)),
    };
    normalized.hitsByWeapon = {
        1: Math.max(0, Math.floor(Number(hitsByWeaponRaw[1] ?? hitsByWeaponRaw.weapon1) || 0)),
        2: Math.max(0, Math.floor(Number(hitsByWeaponRaw[2] ?? hitsByWeaponRaw.weapon2) || 0)),
        3: Math.max(0, Math.floor(Number(hitsByWeaponRaw[3] ?? hitsByWeaponRaw.weapon3) || 0)),
    };
    normalized.hits = Math.max(0, Math.floor(Number(safeReport.hits) || 0));
    normalized.damageDelta = Math.max(0, Math.floor(Number(safeReport.damageDelta ?? safeReport.damage) || 0));
    normalized.damage = normalized.damageDelta;
    normalized.totalShots = normalized.shotsByWeapon[1] + normalized.shotsByWeapon[2] + normalized.shotsByWeapon[3];
    normalized.totalHits = normalized.hits;
    normalized.lumensSpent = Math.max(0, Math.floor(Number(safeReport.lumensSpent) || 0));
    normalized.lumensGained = Math.max(0, Math.floor(Number(safeReport.lumensGained) || 0));
    normalized.crystalsCollected = Math.max(0, Math.floor(Number(safeReport.crystalsCollected) || 0));
    normalized.sparkIds = normalizeUniqueBattleIds(safeReport.sparkIds, { limit: 1000 });
    normalized.weakZoneHitsById = normalizeBattleCountMap(safeReport.weakZoneHitsById, { limit: 1000 });
    normalized.voiceResults = normalizeBattleVoiceResults(safeReport.voiceResults, { limit: 1000 });
    normalized.baddieDestroyedIds = normalizeUniqueBattleIds(safeReport.baddieDestroyedIds, { limit: 2000 });
    normalized.baddieDamage = Math.max(0, Math.floor(Number(safeReport.baddieDamage) || 0));
    normalized.maxComboHits = Math.max(0, Math.floor(Number(safeReport.maxComboHits) || 0));
    normalized.maxComboMultiplier = Math.max(1, Number(safeReport.maxComboMultiplier) || 1);
    normalized.heldComboX2MaxDuration = Math.max(0, Math.floor(Number(safeReport.heldComboX2MaxDuration) || 0));
    normalized.reachedX1_5InFirst30s = Boolean(safeReport.reachedX1_5InFirst30s);
    normalized.phoenixStage = Math.max(0, Math.floor(Number(safeReport.phoenixStage) || 0));
    normalized.lumensSpentWeapon3First2Min = Math.max(0, Math.floor(Number(safeReport.lumensSpentWeapon3First2Min) || 0));
    normalized.lumensSpentOtherFirst2Min = Math.max(0, Math.floor(Number(safeReport.lumensSpentOtherFirst2Min) || 0));
    normalized.damageAfterZeroLumens = Math.max(0, Math.floor(Number(safeReport.damageAfterZeroLumens) || 0));

    return normalized;
}

function isBattleReportEmpty(report) {
    if (!report || typeof report !== 'object') return true;
    const shotsByWeapon = report.shotsByWeapon && typeof report.shotsByWeapon === 'object'
        ? report.shotsByWeapon
        : {};
    const hitsByWeapon = report.hitsByWeapon && typeof report.hitsByWeapon === 'object'
        ? report.hitsByWeapon
        : {};
    const weakZoneHitsById = report.weakZoneHitsById && typeof report.weakZoneHitsById === 'object'
        ? report.weakZoneHitsById
        : {};

    return (
        (Number(report.hits) || 0) <= 0
        && (Number(report.damageDelta ?? report.damage) || 0) <= 0
        && (Number(report.lumensSpent) || 0) <= 0
        && (Number(report.lumensGained) || 0) <= 0
        && (Number(report.crystalsCollected) || 0) <= 0
        && (Number(report.baddieDamage) || 0) <= 0
        && (Number(report.maxComboHits) || 0) <= 0
        && (Number(report.heldComboX2MaxDuration) || 0) <= 0
        && (Number(report.phoenixStage) || 0) <= 0
        && (Number(report.lumensSpentWeapon3First2Min) || 0) <= 0
        && (Number(report.lumensSpentOtherFirst2Min) || 0) <= 0
        && (Number(report.damageAfterZeroLumens) || 0) <= 0
        && !Boolean(report.reachedX1_5InFirst30s)
        && (Number(shotsByWeapon[1] ?? shotsByWeapon.weapon1) || 0) <= 0
        && (Number(shotsByWeapon[2] ?? shotsByWeapon.weapon2) || 0) <= 0
        && (Number(shotsByWeapon[3] ?? shotsByWeapon.weapon3) || 0) <= 0
        && (Number(hitsByWeapon[1] ?? hitsByWeapon.weapon1) || 0) <= 0
        && (Number(hitsByWeapon[2] ?? hitsByWeapon.weapon2) || 0) <= 0
        && (Number(hitsByWeapon[3] ?? hitsByWeapon.weapon3) || 0) <= 0
        && !Object.keys(weakZoneHitsById).length
        && !normalizeUniqueBattleIds(report.sparkIds, { limit: 1 }).length
        && !normalizeBattleVoiceResults(report.voiceResults, { limit: 1 }).length
        && !normalizeUniqueBattleIds(report.baddieDestroyedIds, { limit: 1 }).length
    );
}

function mergeBattleCountMaps(base = {}, chunk = {}, { limit = 1000 } = {}) {
    const merged = { ...normalizeBattleCountMap(base, { limit }) };
    for (const [key, value] of Object.entries(normalizeBattleCountMap(chunk, { limit }))) {
        merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
    }
    return normalizeBattleCountMap(merged, { limit });
}

function mergeBattleVoiceResults(base = [], chunk = [], { limit = 1000 } = {}) {
    const map = new Map();
    for (const row of normalizeBattleVoiceResults(base, { limit })) {
        map.set(row.id, row);
    }
    for (const row of normalizeBattleVoiceResults(chunk, { limit })) {
        map.set(row.id, row);
    }
    return Array.from(map.values()).slice(0, limit);
}

function buildAttendanceDerivedMetricsFromReported(reported) {
    const safeReported = normalizeBattleReport(reported);
    const weakZoneHits = Object.values(safeReported.weakZoneHitsById || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const totalHits = Math.max(
        0,
        Number(safeReported.totalHits)
        || Number(safeReported.hits)
        || (Number(safeReported.hitsByWeapon?.[1]) || 0) + (Number(safeReported.hitsByWeapon?.[2]) || 0) + (Number(safeReported.hitsByWeapon?.[3]) || 0),
    );
    let voiceCommandsSuccess = 0;
    let voiceCommandsSilenceSuccess = 0;
    let voiceCommandsAttackSuccess = 0;
    let voiceCommandsConsecutive = 0;
    let voiceCommandsTotalAttempts = 0;
    let bestVoiceConsecutive = 0;
    const voiceCommandsHistory = [];

    for (const voiceRow of safeReported.voiceResults) {
        const success = Boolean(voiceRow.success);
        voiceCommandsHistory.push(success);
        voiceCommandsTotalAttempts += 1;
        if (success) {
            voiceCommandsSuccess += 1;
            voiceCommandsConsecutive += 1;
            if (voiceRow.text === 'СТРЕЛЯЙ') voiceCommandsSilenceSuccess += 1;
            if (voiceRow.text === 'СТОЙ') voiceCommandsAttackSuccess += 1;
        } else {
            voiceCommandsConsecutive = 0;
        }
        bestVoiceConsecutive = Math.max(bestVoiceConsecutive, voiceCommandsConsecutive);
    }

    return {
        damage: Math.max(0, Number(safeReported.damage) || Number(safeReported.damageDelta) || 0),
        totalShots: Math.max(0, Number(safeReported.totalShots) || 0),
        totalHits,
        lumensSpentTotal: Math.max(0, Number(safeReported.lumensSpent) || 0),
        lumensGainedTotal: Math.max(0, Number(safeReported.lumensGained) || 0),
        crystalsCollected: Math.max(0, Number(safeReported.crystalsCollected) || safeReported.sparkIds.length || 0),
        sparkIds: safeReported.sparkIds,
        weakZoneHits,
        nonWeakZoneHits: Math.max(0, totalHits - weakZoneHits),
        weapon2Hits: Math.max(0, Number(safeReported.hitsByWeapon?.[2]) || 0),
        weapon3Hits: Math.max(0, Number(safeReported.hitsByWeapon?.[3]) || 0),
        nonBaseWeaponHits: Math.max(0, Number(safeReported.hitsByWeapon?.[2]) || 0) + Math.max(0, Number(safeReported.hitsByWeapon?.[3]) || 0),
        voiceCommandsSuccess,
        voiceCommandsSilenceSuccess,
        voiceCommandsAttackSuccess,
        voiceCommandsConsecutive: bestVoiceConsecutive,
        voiceCommandsTotalAttempts,
        voiceCommandsHistory,
        baddieDestroyedIds: safeReported.baddieDestroyedIds,
        darknessDamageFromBaddies: Math.max(0, Number(safeReported.baddieDamage) || 0),
        comboHits: Math.max(0, Number(safeReported.maxComboHits) || 0),
        comboMultiplier: Math.max(1, Number(safeReported.maxComboMultiplier) || 1),
        heldComboX2MaxDuration: Math.max(0, Number(safeReported.heldComboX2MaxDuration) || 0),
        reachedX1_5InFirst30s: Boolean(safeReported.reachedX1_5InFirst30s),
        phoenixStage: Math.max(0, Number(safeReported.phoenixStage) || 0),
        lumensSpentWeapon3First2Min: Math.max(0, Number(safeReported.lumensSpentWeapon3First2Min) || 0),
        lumensSpentOtherFirst2Min: Math.max(0, Number(safeReported.lumensSpentOtherFirst2Min) || 0),
        damageAfterZeroLumens: Math.max(0, Number(safeReported.damageAfterZeroLumens) || 0),
    };
}

function mergeBattleReportedState(current, chunk) {
    const base = normalizeBattleReport(current);
    const incoming = normalizeBattleReport(chunk, base.intervalSeconds || 60);
    const merged = createEmptyBattleReportedState(base.intervalSeconds || incoming.intervalSeconds || 60);

    merged.shotsByWeapon = {
        1: (Number(base.shotsByWeapon?.[1]) || 0) + (Number(incoming.shotsByWeapon?.[1]) || 0),
        2: (Number(base.shotsByWeapon?.[2]) || 0) + (Number(incoming.shotsByWeapon?.[2]) || 0),
        3: (Number(base.shotsByWeapon?.[3]) || 0) + (Number(incoming.shotsByWeapon?.[3]) || 0),
    };
    merged.hitsByWeapon = {
        1: (Number(base.hitsByWeapon?.[1]) || 0) + (Number(incoming.hitsByWeapon?.[1]) || 0),
        2: (Number(base.hitsByWeapon?.[2]) || 0) + (Number(incoming.hitsByWeapon?.[2]) || 0),
        3: (Number(base.hitsByWeapon?.[3]) || 0) + (Number(incoming.hitsByWeapon?.[3]) || 0),
    };
    merged.hits = (Number(base.hits) || 0) + (Number(incoming.hits) || 0);
    merged.damageDelta = (Number(base.damageDelta) || 0) + (Number(incoming.damageDelta) || 0);
    merged.damage = merged.damageDelta;
    merged.totalShots = merged.shotsByWeapon[1] + merged.shotsByWeapon[2] + merged.shotsByWeapon[3];
    merged.totalHits = merged.hits;
    merged.lumensSpent = (Number(base.lumensSpent) || 0) + (Number(incoming.lumensSpent) || 0);
    merged.lumensGained = (Number(base.lumensGained) || 0) + (Number(incoming.lumensGained) || 0);
    merged.crystalsCollected = (Number(base.crystalsCollected) || 0) + (Number(incoming.crystalsCollected) || 0);
    merged.sparkIds = normalizeUniqueBattleIds([...(base.sparkIds || []), ...(incoming.sparkIds || [])], { limit: 1000 });
    merged.weakZoneHitsById = mergeBattleCountMaps(base.weakZoneHitsById, incoming.weakZoneHitsById, { limit: 1000 });
    merged.voiceResults = mergeBattleVoiceResults(base.voiceResults, incoming.voiceResults, { limit: 1000 });
    merged.baddieDestroyedIds = normalizeUniqueBattleIds([...(base.baddieDestroyedIds || []), ...(incoming.baddieDestroyedIds || [])], { limit: 2000 });
    merged.baddieDamage = (Number(base.baddieDamage) || 0) + (Number(incoming.baddieDamage) || 0);
    merged.maxComboHits = Math.max(Number(base.maxComboHits) || 0, Number(incoming.maxComboHits) || 0);
    merged.maxComboMultiplier = Math.max(Number(base.maxComboMultiplier) || 1, Number(incoming.maxComboMultiplier) || 1);
    merged.heldComboX2MaxDuration = Math.max(Number(base.heldComboX2MaxDuration) || 0, Number(incoming.heldComboX2MaxDuration) || 0);
    merged.reachedX1_5InFirst30s = Boolean(base.reachedX1_5InFirst30s || incoming.reachedX1_5InFirst30s);
    merged.phoenixStage = Math.max(Number(base.phoenixStage) || 0, Number(incoming.phoenixStage) || 0);
    merged.lumensSpentWeapon3First2Min = (Number(base.lumensSpentWeapon3First2Min) || 0) + (Number(incoming.lumensSpentWeapon3First2Min) || 0);
    merged.lumensSpentOtherFirst2Min = (Number(base.lumensSpentOtherFirst2Min) || 0) + (Number(incoming.lumensSpentOtherFirst2Min) || 0);
    merged.damageAfterZeroLumens = (Number(base.damageAfterZeroLumens) || 0) + (Number(incoming.damageAfterZeroLumens) || 0);

    return merged;
}

function applyBattleReportToAttendanceEntry(entry, report, {
    reportSequence = null,
    receivedAt = new Date(),
    markFinal = false,
} = {}) {
    const nextEntry = cloneRuntimeEntry(entry) || {};
    const mergedReported = mergeBattleReportedState(nextEntry.reported, report);
    const derived = buildAttendanceDerivedMetricsFromReported(mergedReported);
    const receivedAtIso = receivedAt instanceof Date ? receivedAt.toISOString() : new Date(receivedAt || Date.now()).toISOString();

    nextEntry.reported = mergedReported;
    Object.assign(nextEntry, derived);
    nextEntry.lastClientSyncAt = receivedAtIso;
    if (Number.isFinite(Number(reportSequence)) && Number(reportSequence) > 0) {
        nextEntry.lastAcceptedReportSequence = Math.max(
            0,
            Number(nextEntry.lastAcceptedReportSequence) || 0,
            Math.floor(Number(reportSequence) || 0),
        );
    }
    if (markFinal) {
        nextEntry.finalReportAt = receivedAtIso;
    }

    return nextEntry;
}

function resolveBattleReportTargetMs(entry, reportIndex = 0) {
    const joinedAtMs = new Date(entry?.joinedAt || Date.now()).getTime();
    if (!Number.isFinite(joinedAtMs)) {
        return null;
    }

    const intervalMs = Math.max(
        1000,
        Math.floor((Number(entry?.syncIntervalSeconds) || 60) * 1000),
    );
    const slotCount = Math.max(1, Math.floor(Number(entry?.syncSlotCount) || 60));
    const slot = Math.max(0, Math.floor(Number(entry?.syncSlot) || 0)) % slotCount;
    const safeReportIndex = Math.max(0, Math.floor(Number(reportIndex) || 0));

    let targetMs = joinedAtMs + intervalMs + (safeReportIndex * intervalMs);
    if (slotCount > 1) {
        const slotWindowMs = Math.max(1, Math.floor(intervalMs / slotCount));
        const cycleStartMs = Math.floor(targetMs / intervalMs) * intervalMs;
        const slotTargetMs = cycleStartMs + (slot * slotWindowMs);
        targetMs = slotTargetMs >= targetMs ? slotTargetMs : slotTargetMs + intervalMs;
    }

    return targetMs;
}

function isBattleReportReadyForEntry(entry, receivedAt = new Date()) {
    const nextReportIndex = Math.max(0, Math.floor(Number(entry?.lastAcceptedReportSequence) || 0));
    const targetMs = resolveBattleReportTargetMs(entry, nextReportIndex);
    if (!Number.isFinite(targetMs)) {
        return true;
    }

    const receivedAtMs = receivedAt instanceof Date
        ? receivedAt.getTime()
        : new Date(receivedAt || Date.now()).getTime();
    if (!Number.isFinite(receivedAtMs)) {
        return true;
    }

    return (receivedAtMs + BATTLE_REPORT_EARLY_GRACE_MS) >= targetMs;
}

function applyAcceptedFinalReportToEntry(entry, acceptedFinalReport) {
    const acceptedFinalSequence = Math.max(0, Math.floor(Number(acceptedFinalReport?.reportSequence) || 0));
    const currentAcceptedSequence = Math.max(0, Math.floor(Number(entry?.lastAcceptedReportSequence) || 0));
    if (!acceptedFinalReport?.report || acceptedFinalSequence <= currentAcceptedSequence) {
        return entry;
    }

    return applyBattleReportToAttendanceEntry(entry, acceptedFinalReport.report, {
        reportSequence: acceptedFinalSequence,
        receivedAt: acceptedFinalReport.acceptedAt || new Date(),
        markFinal: true,
    });
}

function buildFinalReportPreviewEntry({
    attendanceEntry,
    hasReportPayload,
    normalizedReport,
    reportSequence,
    acceptedAt,
}) {
    if (hasReportPayload) {
        const previewEntry = applyBattleReportToAttendanceEntry(attendanceEntry, normalizedReport, {
            reportSequence,
            receivedAt: acceptedAt,
            markFinal: true,
        });
        previewEntry.finalReportHasPayload = true;
        previewEntry.personalDataSource = 'final_report';
        return previewEntry;
    }

    return {
        ...cloneRuntimeEntry(attendanceEntry),
        finalReportAt: acceptedAt,
        finalReportHasPayload: false,
        personalDataSource: (attendanceEntry?.lastClientSyncAt || attendanceEntry?.reported)
            ? 'last_heartbeat'
            : 'none',
    };
}

function getAcceptedFinalReportSequence(finalReport) {
    return Math.max(0, Math.floor(Number(finalReport?.reportSequence) || 0));
}

function shouldIgnoreFinalReportSequence({ existingFinalReport, reportSequence }) {
    const existingFinalSequence = getAcceptedFinalReportSequence(existingFinalReport);
    const safeSequence = Math.max(0, Math.floor(Number(reportSequence) || 0));
    return existingFinalSequence >= safeSequence;
}

function buildFinalReportStoreRecord({
    battleId,
    userId,
    reportSequence,
    normalizedReport,
    hasReportPayload,
    acceptedAt,
    attendanceEntry = null,
}) {
    return {
        battleId: String(battleId),
        userId: String(userId),
        reportSequence: Math.max(0, Math.floor(Number(reportSequence) || 0)),
        report: hasReportPayload ? normalizedReport : null,
        acceptedAt,
        hasPayload: Boolean(hasReportPayload),
        lastAcceptedReportSequence: Math.max(0, Math.floor(Number(attendanceEntry?.lastAcceptedReportSequence) || 0)),
    };
}

function buildFinalReportRequestPayload({ requestBody, attendanceEntry } = {}) {
    const body = requestBody && typeof requestBody === 'object' ? requestBody : {};
    const safeSequence = Math.max(0, Math.floor(Number(body.reportSequence) || 0));
    const report = body.report && typeof body.report === 'object' ? body.report : null;
    const normalizedReport = normalizeBattleReport(report, attendanceEntry?.syncIntervalSeconds || 60);
    const hasReportPayload = Boolean(report) && !isBattleReportEmpty(normalizedReport);
    return {
        finalMarker: Boolean(body.finalMarker),
        hasReportPayload,
        normalizedReport,
        report,
        safeSequence,
    };
}

function getFinalReportWindowState({ battle, finalConfig, nowMs }) {
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    if (!Number.isFinite(endsAtMs)) {
        return {
            ok: false,
            reason: 'missing_end_time',
            endsAtMs,
            reportAcceptEndsAtMs: NaN,
        };
    }

    const reportAcceptEndsAtMs = endsAtMs + (Number(finalConfig?.reportAcceptSeconds) * 1000);
    if (Number(nowMs) < endsAtMs) {
        return {
            ok: false,
            reason: 'battle_active',
            endsAtMs,
            reportAcceptEndsAtMs,
        };
    }
    if (Number(nowMs) > reportAcceptEndsAtMs) {
        return {
            ok: false,
            reason: 'window_closed',
            endsAtMs,
            reportAcceptEndsAtMs,
        };
    }

    return {
        ok: true,
        reason: 'open',
        endsAtMs,
        reportAcceptEndsAtMs,
    };
}

module.exports = {
    applyAcceptedFinalReportToEntry,
    applyBattleReportToAttendanceEntry,
    buildFinalReportStoreRecord,
    buildFinalReportRequestPayload,
    buildFinalReportPreviewEntry,
    buildAttendanceDerivedMetricsFromReported,
    createEmptyBattleReportedState,
    getAcceptedFinalReportSequence,
    getFinalReportWindowState,
    isBattleReportEmpty,
    isBattleReportReadyForEntry,
    mergeBattleReportedState,
    normalizeBattleReport,
    resolveBattleReportTargetMs,
    shouldIgnoreFinalReportSequence,
};
