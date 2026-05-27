import {
    BADDIE_DAMAGE_INTERVAL,
    BATTLE_REPORT_INTERVAL_SECONDS,
    FINAL_REPORT_RETRY_INTERVAL_MS,
    VOICE_COMMAND_SHOOT,
    VOICE_COMMAND_STOP,
} from './battleConstants';
import type {
    BattleActiveVoiceCommand,
    BattleBoostState,
    BattleInjury,
    BattleMinuteReportAccumulator,
    BattlePersonalState,
    BattleScenario,
    BattleScenarioBaddieWave,
    BattleScenarioSpark,
    BattleScenarioVoiceCommand,
    BattleScenarioWeakZone,
    BattleWeakZone,
    BattleWorldPoint,
    StoredBattleProgress,
} from './battleTypes';

export const getComboMultiplier = (count: number) => {
    if (count >= 200) return 2;
    if (count >= 150) return 1.5;
    return 1;
};

export const formatBattleTimeLeft = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const isSameWorldPoint = (a: BattleWorldPoint | null | undefined, b: BattleWorldPoint | null | undefined) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.z === b.z;
};

export const isSameWeakZoneState = (a: BattleWeakZone | null | undefined, b: BattleWeakZone | null | undefined) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id && a.active === b.active && a.radius === b.radius && isSameWorldPoint(a.center, b.center);
};

export const isSameVoiceCommandState = (
    a: BattleActiveVoiceCommand | null | undefined,
    b: BattleActiveVoiceCommand | null | undefined,
) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id
        && a.text === b.text
        && a.endsAt === b.endsAt
        && a.requireShot === b.requireShot
        && a.durationMs === b.durationMs;
};

function hashBattleFinalSeed(source: string): number {
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function computeBattleFinalInitialDelayMs({
    battleId,
    userId,
    attendanceCount,
    capacity,
    retryIntervalMs,
}: {
    battleId: string | null;
    userId: string | null;
    attendanceCount: number;
    capacity: number;
    retryIntervalMs: number;
}): number {
    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();
    const safeAttendanceCount = Math.max(1, Math.floor(Number(attendanceCount) || 1));
    const safeCapacity = Math.max(1, Math.floor(Number(capacity) || 1));
    const safeRetryIntervalMs = Math.max(250, Math.floor(Number(retryIntervalMs) || FINAL_REPORT_RETRY_INTERVAL_MS));
    const rounds = Math.max(1, Math.ceil(safeAttendanceCount / safeCapacity));
    const totalSpreadMs = Math.max(safeRetryIntervalMs, rounds * safeRetryIntervalMs);
    if (!safeBattleId || !safeUserId) return 0;
    return hashBattleFinalSeed(`${safeBattleId}:${safeUserId}`) % totalSpreadMs;
}

export const isBoostActiveForBattle = (boost: BattleBoostState | null | undefined, battleId: string | null) => {
    if (!boost) return false;
    if (boost.pending) return true;
    if (!boost.battleId || !battleId) return false;
    return String(boost.battleId) === String(battleId);
};

export const parseBattleScenario = (value: unknown): BattleScenario | null => {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;

    const weakZones = Array.isArray(row.weakZones)
        ? row.weakZones
            .map((item) => {
                const zone = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const center = zone.center && typeof zone.center === 'object'
                    ? zone.center as Record<string, unknown>
                    : {};
                const id = String(zone.id || '').trim();
                if (!id) return null;
                return {
                    id,
                    startOffsetMs: Math.max(0, Math.floor(Number(zone.startOffsetMs) || 0)),
                    endOffsetMs: Math.max(0, Math.floor(Number(zone.endOffsetMs) || 0)),
                    radius: Math.max(0, Number(zone.radius) || 0),
                    center: {
                        x: Number(center.x) || 0,
                        y: Number(center.y) || 0,
                        z: Number(center.z) || 0,
                    },
                };
            })
            .filter((item): item is BattleScenarioWeakZone => Boolean(item))
        : [];

    const voiceCommands = Array.isArray(row.voiceCommands)
        ? row.voiceCommands
            .map((item) => {
                const command = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const id = String(command.id || '').trim();
                if (!id) return null;
                const text = String(command.text || '').trim() === VOICE_COMMAND_STOP ? VOICE_COMMAND_STOP : VOICE_COMMAND_SHOOT;
                return {
                    id,
                    startOffsetMs: Math.max(0, Math.floor(Number(command.startOffsetMs) || 0)),
                    endOffsetMs: Math.max(0, Math.floor(Number(command.endOffsetMs) || 0)),
                    durationMs: Math.max(0, Math.floor(Number(command.durationMs) || 0)),
                    text,
                    requireShot: Boolean(command.requireShot),
                };
            })
            .filter((item): item is BattleScenarioVoiceCommand => Boolean(item))
        : [];

    const sparks = Array.isArray(row.sparks)
        ? row.sparks
            .map((item) => {
                const spark = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const id = String(spark.id || '').trim();
                if (!id) return null;
                return {
                    id,
                    startOffsetMs: Math.max(0, Math.floor(Number(spark.startOffsetMs) || 0)),
                    x: Number(spark.x) || 0,
                    y: Number(spark.y) || 0,
                    vx: Number(spark.vx) || 0,
                    vy: Number(spark.vy) || 0,
                    rewardLumens: Math.max(0, Math.floor(Number(spark.rewardLumens) || 0)),
                };
            })
            .filter((item): item is BattleScenarioSpark => Boolean(item))
        : [];

    const baddieWaves = Array.isArray(row.baddieWaves)
        ? row.baddieWaves
            .map((item) => {
                const wave = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const id = String(wave.id || '').trim();
                if (!id) return null;
                const spheres = Array.isArray(wave.spheres)
                    ? wave.spheres
                        .map((sphereItem) => {
                            const sphere = sphereItem && typeof sphereItem === 'object'
                                ? sphereItem as Record<string, unknown>
                                : {};
                            const sphereId = String(sphere.id || '').trim();
                            if (!sphereId) return null;
                            return {
                                id: sphereId,
                                x: Number(sphere.x) || 0,
                                y: Number(sphere.y) || 0,
                                size: Math.max(0, Number(sphere.size) || 0),
                                color: String(sphere.color || '#2a0404') || '#2a0404',
                                shape: String(sphere.shape || '').trim() === 'crystal' ? 'crystal' : 'spike',
                                speed: Math.max(0, Number(sphere.speed) || 0),
                            };
                        })
                        .filter((sphere): sphere is BattleScenarioBaddieWave['spheres'][number] => Boolean(sphere))
                    : [];
                return {
                    id,
                    startOffsetMs: Math.max(0, Math.floor(Number(wave.startOffsetMs) || 0)),
                    spheres,
                };
            })
            .filter((item): item is BattleScenarioBaddieWave => Boolean(item))
        : [];

    return {
        version: Math.max(1, Math.floor(Number(row.version) || 1)),
        durationSeconds: Math.max(0, Math.floor(Number(row.durationSeconds) || 0)),
        sparkRewardLumens: Math.max(0, Math.floor(Number(row.sparkRewardLumens) || 0)),
        baddieDamagePerTick: Math.max(0, Math.floor(Number(row.baddieDamagePerTick) || 0)),
        baddieDamageIntervalMs: Math.max(1, Math.floor(Number(row.baddieDamageIntervalMs) || BADDIE_DAMAGE_INTERVAL)),
        weakZones,
        voiceCommands,
        sparks,
        baddieWaves,
    };
};

export const parseBattleInjuries = (value: unknown): BattleInjury[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((injury) => {
            const row = injury && typeof injury === 'object'
                ? injury as Record<string, unknown>
                : {};
            return {
                branchName: String(row.branchName || ''),
                debuffPercent: Number(row.debuffPercent) || 0,
            };
        })
        .filter((injury) => Boolean(injury.branchName));
};

export const getBattleElapsedMs = (battleStartsAtMs: number | null, serverOffsetMs: number) => {
    if (battleStartsAtMs == null) return 0;
    return Math.max(0, Math.round((Date.now() + serverOffsetMs) - battleStartsAtMs));
};

export const getScenarioPastEventState = (scenario: BattleScenario | null, elapsedMs: number) => {
    if (!scenario) {
        return {
            pastSparkIds: [] as string[],
            pastBaddieWaveIds: [] as string[],
        };
    }

    return {
        pastSparkIds: scenario.sparks
            .filter((item) => elapsedMs > item.startOffsetMs)
            .map((item) => item.id),
        pastBaddieWaveIds: scenario.baddieWaves
            .filter((item) => elapsedMs > item.startOffsetMs)
            .map((item) => item.id),
    };
};

export const createEmptyBattleMinuteReport = (intervalSeconds = BATTLE_REPORT_INTERVAL_SECONDS): BattleMinuteReportAccumulator => ({
    intervalSeconds: Math.max(1, Math.round(Number(intervalSeconds) || BATTLE_REPORT_INTERVAL_SECONDS)),
    shotsByWeapon: {},
    hitsByWeapon: {},
    hits: 0,
    damageDelta: 0,
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
});

export const cloneBattleMinuteReport = (report: BattleMinuteReportAccumulator): BattleMinuteReportAccumulator => ({
    intervalSeconds: Math.max(1, Math.round(Number(report?.intervalSeconds) || BATTLE_REPORT_INTERVAL_SECONDS)),
    shotsByWeapon: { ...(report?.shotsByWeapon || {}) },
    hitsByWeapon: { ...(report?.hitsByWeapon || {}) },
    hits: Math.max(0, Math.round(Number(report?.hits) || 0)),
    damageDelta: Math.max(0, Math.round(Number(report?.damageDelta) || 0)),
    lumensSpent: Math.max(0, Math.round(Number(report?.lumensSpent) || 0)),
    lumensGained: Math.max(0, Math.round(Number(report?.lumensGained) || 0)),
    crystalsCollected: Math.max(0, Math.round(Number(report?.crystalsCollected) || 0)),
    sparkIds: Array.isArray(report?.sparkIds) ? [...report.sparkIds] : [],
    weakZoneHitsById: { ...(report?.weakZoneHitsById || {}) },
    voiceResults: Array.isArray(report?.voiceResults) ? report.voiceResults.map((item) => ({ ...item })) : [],
    baddieDestroyedIds: Array.isArray(report?.baddieDestroyedIds) ? [...report.baddieDestroyedIds] : [],
    baddieDamage: Math.max(0, Math.round(Number(report?.baddieDamage) || 0)),
    maxComboHits: Math.max(0, Math.round(Number(report?.maxComboHits) || 0)),
    maxComboMultiplier: Math.max(1, Number(report?.maxComboMultiplier) || 1),
    heldComboX2MaxDuration: Math.max(0, Math.round(Number(report?.heldComboX2MaxDuration) || 0)),
    reachedX1_5InFirst30s: Boolean(report?.reachedX1_5InFirst30s),
    phoenixStage: Math.max(0, Math.round(Number(report?.phoenixStage) || 0)),
    lumensSpentWeapon3First2Min: Math.max(0, Math.round(Number(report?.lumensSpentWeapon3First2Min) || 0)),
    lumensSpentOtherFirst2Min: Math.max(0, Math.round(Number(report?.lumensSpentOtherFirst2Min) || 0)),
    damageAfterZeroLumens: Math.max(0, Math.round(Number(report?.damageAfterZeroLumens) || 0)),
});

export const normalizeStoredBattleProgress = (
    value: unknown,
    {
        battleId,
        userId,
    }: {
        battleId: string;
        userId: string;
    },
): StoredBattleProgress | null => {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (String(row.battleId || '').trim() !== battleId || String(row.userId || '').trim() !== userId) {
        return null;
    }

    const pendingReportRow = row.pendingReport && typeof row.pendingReport === 'object'
        ? row.pendingReport as Record<string, unknown>
        : null;
    const pendingReportSequence = Math.max(0, Math.floor(Number(pendingReportRow?.sequence) || 0));
    const pendingReport = pendingReportRow && pendingReportSequence > 0
        ? {
            sequence: pendingReportSequence,
            report: cloneBattleMinuteReport(
                pendingReportRow?.report as BattleMinuteReportAccumulator || createEmptyBattleMinuteReport(),
            ),
        }
        : null;

    return {
        version: Math.max(1, Math.floor(Number(row.version) || 1)),
        battleId,
        userId,
        savedAt: Math.max(0, Math.floor(Number(row.savedAt) || 0)),
        joinedAtIso: typeof row.joinedAtIso === 'string' && row.joinedAtIso.trim() ? row.joinedAtIso : null,
        battleJoinedAtMs: Number.isFinite(Number(row.battleJoinedAtMs))
            ? Math.max(0, Math.floor(Number(row.battleJoinedAtMs) || 0))
            : null,
        startLumens: row.startLumens == null ? null : Math.max(0, Math.round(Number(row.startLumens) || 0)),
        startK: row.startK == null ? null : Math.max(0, Math.round(Number(row.startK) || 0)),
        startStars: row.startStars == null ? null : Math.max(0, Number(row.startStars) || 0),
        confirmedUserDamage: Math.max(0, Math.round(Number(row.confirmedUserDamage) || 0)),
        pendingUserDamage: Math.max(0, Math.round(Number(row.pendingUserDamage) || 0)),
        predictedLumens: Math.max(0, Math.round(Number(row.predictedLumens) || 0)),
        comboCount: Math.max(0, Math.round(Number(row.comboCount) || 0)),
        comboSeriesDamage: Math.max(0, Math.round(Number(row.comboSeriesDamage) || 0)),
        comboUpdatedAt: Number.isFinite(Number(row.comboUpdatedAt)) ? Math.floor(Number(row.comboUpdatedAt) || 0) : null,
        comboX2StartedAt: Number.isFinite(Number(row.comboX2StartedAt)) ? Math.floor(Number(row.comboX2StartedAt) || 0) : null,
        comboX2MaxDuration: Math.max(0, Math.round(Number(row.comboX2MaxDuration) || 0)),
        phoenixStage: Math.max(0, Math.round(Number(row.phoenixStage) || 0)),
        report: cloneBattleMinuteReport(row.report as BattleMinuteReportAccumulator || createEmptyBattleMinuteReport()),
        pendingReport,
        nextReportSequence: Math.max(
            pendingReport ? pendingReport.sequence + 1 : 1,
            Math.floor(Number(row.nextReportSequence) || 1),
        ),
        processedSparkIds: Array.isArray(row.processedSparkIds) ? row.processedSparkIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
        processedBaddieWaveIds: Array.isArray(row.processedBaddieWaveIds) ? row.processedBaddieWaveIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
        actedVoiceIds: Array.isArray(row.actedVoiceIds) ? row.actedVoiceIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
        finalizedVoiceIds: Array.isArray(row.finalizedVoiceIds) ? row.finalizedVoiceIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
    };
};

export const normalizeBattlePersonalState = (value: unknown): BattlePersonalState | null => {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    return {
        joinedAt: typeof row.joinedAt === 'string' && row.joinedAt.trim() ? row.joinedAt : null,
        confirmedDamage: Math.max(0, Math.round(Number(row.confirmedDamage) || 0)),
        confirmedLumens: row.confirmedLumens == null ? null : Math.max(0, Math.round(Number(row.confirmedLumens) || 0)),
        startLumens: row.startLumens == null ? null : Math.max(0, Math.round(Number(row.startLumens) || 0)),
        startK: row.startK == null ? null : Math.max(0, Math.round(Number(row.startK) || 0)),
        startStars: row.startStars == null ? null : Math.max(0, Number(row.startStars) || 0),
        lastAcceptedReportSequence: Math.max(0, Math.floor(Number(row.lastAcceptedReportSequence) || 0)),
        lastClientSyncAt: typeof row.lastClientSyncAt === 'string' && row.lastClientSyncAt.trim() ? row.lastClientSyncAt : null,
    };
};

export const isBattleMinuteReportEmpty = (report: BattleMinuteReportAccumulator | null | undefined) => {
    if (!report) return true;
    return (
        (Number(report.hits) || 0) <= 0
        && (Number(report.damageDelta) || 0) <= 0
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
        && !Object.values(report.shotsByWeapon || {}).some((value) => Number(value) > 0)
        && !Object.values(report.hitsByWeapon || {}).some((value) => Number(value) > 0)
        && !Object.values(report.weakZoneHitsById || {}).some((value) => Number(value) > 0)
        && !(report.sparkIds || []).length
        && !(report.voiceResults || []).length
        && !(report.baddieDestroyedIds || []).length
    );
};
