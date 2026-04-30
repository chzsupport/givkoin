'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { EnemyLayer, type EnemyLayerHandle } from './EnemyLayer';
import { GameScene, type ShotAttemptTelemetry } from './GameScene';
import { TreeLayer } from './TreeLayer';
import { BaddieLayer, type Baddie } from './BaddieLayer';
import type { EnemyHitEvent } from './enemyZones';
import { ENEMY_OUTLINE, ENEMY_OUTLINE_HEIGHT, ENEMY_OUTLINE_WIDTH } from './enemyZones';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useSocketContext } from '@/context/SocketContext';
import { useToast } from '@/context/ToastContext';
import { BattleSummaryOverlay } from '@/components/battle/BattleSummaryOverlay';
import { parseBattleSummaryPayload, type BattleSummary, type BattleSummaryPayload } from '@/lib/battleSummary';

const COMBO_RESET_MS = 3000;
const BASE_DOME_CENTER = { x: 0.5, y: 0.57 };
const BASE_DOME_RADIUS = 0.21;
const BASE_DOME_VISUAL_SCALE = 1.05;
const BADDIE_DAMAGE_INTERVAL = 1000;
const BATTLE_REQUEST_TIMEOUT_MS = 8000;
const FINAL_REPORT_RETRY_INTERVAL_MS = 2000;
const FINAL_RESULTS_WAIT_MS = 60000;
const BATTLE_REPORT_INTERVAL_SECONDS = 60;
const PERSONAL_STATE_VISIBLE_TICK_MS = 1000;
const PERSONAL_STATE_HIDDEN_TICK_MS = 5000;
const SHOT_PREVIEW_TTL_MS = 20000;
const BATTLE_PROGRESS_STORAGE_PREFIX = 'givkoin_battle_progress';
const WEAPON_CONFIG = {
    1: { damage: 6, costLumens: 10 },
    2: { damage: 500, costLumens: 100 },
    3: { damage: 5000, costLumens: 500 },
} as const;

const getComboMultiplier = (count: number) => {
    if (count >= 200) return 2;
    if (count >= 150) return 1.5;
    return 1;
};

const isSameWorldPoint = (a: BattleWorldPoint | null | undefined, b: BattleWorldPoint | null | undefined) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.z === b.z;
};

const isSameWeakZoneState = (a: BattleWeakZone | null | undefined, b: BattleWeakZone | null | undefined) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id && a.active === b.active && a.radius === b.radius && isSameWorldPoint(a.center, b.center);
};

const isSameVoiceCommandState = (
    a: { id: string; text: 'СТРЕЛЯЙ' | 'СТОЙ'; endsAt: number; requireShot: boolean; durationMs: number } | null | undefined,
    b: { id: string; text: 'СТРЕЛЯЙ' | 'СТОЙ'; endsAt: number; requireShot: boolean; durationMs: number } | null | undefined,
) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id
        && a.text === b.text
        && a.endsAt === b.endsAt
        && a.requireShot === b.requireShot
        && a.durationMs === b.durationMs;
};

type BattleInjury = {
    branchName: string;
    debuffPercent: number;
};

type BattleScenarioWeakZone = {
    id: string;
    startOffsetMs: number;
    endOffsetMs: number;
    radius: number;
    center: { x: number; y: number; z: number };
};

type BattleScenarioVoiceCommand = {
    id: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    text: 'СТРЕЛЯЙ' | 'СТОЙ';
    requireShot: boolean;
};

type BattleScenarioSpark = {
    id: string;
    startOffsetMs: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rewardLumens: number;
};

type BattleScenarioBaddieWave = {
    id: string;
    startOffsetMs: number;
    spheres: Array<{
        id: string;
        x: number;
        y: number;
        size: number;
        color: string;
        shape: Baddie['shape'];
        speed: number;
    }>;
};

type BattleScenario = {
    version: number;
    durationSeconds: number;
    sparkRewardLumens: number;
    baddieDamagePerTick: number;
    baddieDamageIntervalMs: number;
    weakZones: BattleScenarioWeakZone[];
    voiceCommands: BattleScenarioVoiceCommand[];
    sparks: BattleScenarioSpark[];
    baddieWaves: BattleScenarioBaddieWave[];
};

type BattleVoiceResult = {
    id: string;
    text: 'СТРЕЛЯЙ' | 'СТОЙ';
    acted: boolean;
    success: boolean;
};

type BattleWeakZone = {
    id: string | null;
    active: boolean;
    center: { x: number; y: number; z: number } | null;
    radius: number;
};

type BattleWorldPoint = { x: number; y: number; z: number };

type ShotChargeState = 'charged' | 'penalty' | 'unavailable';

type ShotPreview = {
    at: number;
    weaponId: number;
    chargeState: ShotChargeState;
    aimWorldPoint: BattleWorldPoint | null;
    countsTowardCombo: boolean;
};

type PendingBattleReportChunk = {
    sequence: number;
    report: BattleMinuteReportAccumulator;
};

type BattlePersonalState = {
    joinedAt: string | null;
    confirmedDamage: number;
    confirmedLumens: number | null;
    startLumens: number | null;
    startSc: number | null;
    startStars: number | null;
    lastAcceptedReportSequence: number;
    lastClientSyncAt: string | null;
};

type StoredBattleProgress = {
    version: number;
    battleId: string;
    userId: string;
    savedAt: number;
    joinedAtIso: string | null;
    battleJoinedAtMs: number | null;
    startLumens: number | null;
    startSc: number | null;
    startStars: number | null;
    confirmedUserDamage: number;
    pendingUserDamage: number;
    predictedLumens: number;
    comboCount: number;
    comboSeriesDamage: number;
    comboUpdatedAt: number | null;
    comboX2StartedAt: number | null;
    comboX2MaxDuration: number;
    phoenixStage: number;
    report: BattleMinuteReportAccumulator;
    pendingReport: PendingBattleReportChunk | null;
    nextReportSequence: number;
    processedSparkIds: string[];
    processedBaddieWaveIds: string[];
    actedVoiceIds: string[];
    finalizedVoiceIds: string[];
};

type BattleProgressPersistOverrides = Partial<Omit<StoredBattleProgress, 'version' | 'battleId' | 'userId' | 'savedAt'>>;

type InFlightDamageBatch = {
    id: string;
    remainingPredictedDamage: number;
    timeoutId: number | null;
};

type BattleBoostState = {
    pending?: boolean;
    battleId?: string;
    activatedAt?: string;
};

function hashBattleFinalSeed(source: string): number {
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

function computeBattleFinalInitialDelayMs({
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

const isBoostActiveForBattle = (boost: BattleBoostState | null | undefined, battleId: string | null) => {
    if (!boost) return false;
    if (boost.pending) return true;
    if (!boost.battleId || !battleId) return false;
    return String(boost.battleId) === String(battleId);
};

type BattleMinuteReportAccumulator = {
    intervalSeconds: number;
    shotsByWeapon: Record<number, number>;
    hitsByWeapon: Record<number, number>;
    hits: number;
    damageDelta: number;
    lumensSpent: number;
    lumensGained: number;
    crystalsCollected: number;
    sparkIds: string[];
    weakZoneHitsById: Record<string, number>;
    voiceResults: BattleVoiceResult[];
    baddieDestroyedIds: string[];
    baddieDamage: number;
    maxComboHits: number;
    maxComboMultiplier: number;
    heldComboX2MaxDuration: number;
    reachedX1_5InFirst30s: boolean;
    phoenixStage: number;
    lumensSpentWeapon3First2Min: number;
    lumensSpentOtherFirst2Min: number;
    damageAfterZeroLumens: number;
};

const parseBattleScenario = (value: unknown): BattleScenario | null => {
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
                const text = String(command.text || '').trim() === 'СТОЙ' ? 'СТОЙ' : 'СТРЕЛЯЙ';
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

const getBattleElapsedMs = (battleStartsAtMs: number | null, serverOffsetMs: number) => {
    if (battleStartsAtMs == null) return 0;
    return Math.max(0, Math.round((Date.now() + serverOffsetMs) - battleStartsAtMs));
};

const getScenarioPastEventState = (scenario: BattleScenario | null, elapsedMs: number) => {
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

const createEmptyBattleMinuteReport = (intervalSeconds = BATTLE_REPORT_INTERVAL_SECONDS): BattleMinuteReportAccumulator => ({
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

const cloneBattleMinuteReport = (report: BattleMinuteReportAccumulator): BattleMinuteReportAccumulator => ({
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

const normalizeStoredBattleProgress = (
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
        startSc: row.startSc == null ? null : Math.max(0, Math.round(Number(row.startSc) || 0)),
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

const normalizeBattlePersonalState = (value: unknown): BattlePersonalState | null => {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    return {
        joinedAt: typeof row.joinedAt === 'string' && row.joinedAt.trim() ? row.joinedAt : null,
        confirmedDamage: Math.max(0, Math.round(Number(row.confirmedDamage) || 0)),
        confirmedLumens: row.confirmedLumens == null ? null : Math.max(0, Math.round(Number(row.confirmedLumens) || 0)),
        startLumens: row.startLumens == null ? null : Math.max(0, Math.round(Number(row.startLumens) || 0)),
        startSc: row.startSc == null ? null : Math.max(0, Math.round(Number(row.startSc) || 0)),
        startStars: row.startStars == null ? null : Math.max(0, Number(row.startStars) || 0),
        lastAcceptedReportSequence: Math.max(0, Math.floor(Number(row.lastAcceptedReportSequence) || 0)),
        lastClientSyncAt: typeof row.lastClientSyncAt === 'string' && row.lastClientSyncAt.trim() ? row.lastClientSyncAt : null,
    };
};

const isBattleMinuteReportEmpty = (report: BattleMinuteReportAccumulator | null | undefined) => {
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

export default function BattlePage() {
    const { user, updateUser } = useAuth();
    const socket = useSocketContext();
    const toast = useToast();
    const { language, t, localePath } = useI18n();
    const [userDamage, setUserDamage] = useState(0);
    const [battleId, setBattleId] = useState<string | null>(null);
    const [battleScenario, setBattleScenario] = useState<BattleScenario | null>(null);
    const [isBattleActive, setIsBattleActive] = useState(false);
    const [battleStartsAtMs, setBattleStartsAtMs] = useState<number | null>(null);
    const [battleEndsAtMs, setBattleEndsAtMs] = useState<number | null>(null);
    const [battleTimeLeftMs, setBattleTimeLeftMs] = useState<number>(0);
    const [weakZone, setWeakZone] = useState<BattleWeakZone | null>(null);
    const [battleInjuries, setBattleInjuries] = useState<BattleInjury[]>([]);
    const [baddies, setBaddies] = useState<Array<Baddie & { speed: number; attached: boolean; lastDamageAt: number }>>([]);
    const [domeBlinkAt, setDomeBlinkAt] = useState(0);

    const [spark, setSpark] = useState<{ id: string; x: number; y: number; vx: number; vy: number } | null>(null);
    const [voiceCommand, setVoiceCommand] = useState<{ id: string; text: 'СТРЕЛЯЙ' | 'СТОЙ'; endsAt: number; requireShot: boolean; durationMs: number } | null>(null);
    const [voiceProgress, setVoiceProgress] = useState(0);
    const [comboCount, setComboCount] = useState(0);
    const [attendanceCount, setAttendanceCount] = useState(0);
    const [battleSummary, setBattleSummary] = useState<BattleSummary | null>(null);
    const [summaryVisible, setSummaryVisible] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [rulesModalVisible, setRulesModalVisible] = useState(false);
    const [performanceTier, setPerformanceTier] = useState<'low' | 'medium' | 'high'>('high');
    const [isTabVisible, setIsTabVisible] = useState(true);
    const [displayedLumens, setDisplayedLumens] = useState(0);
    const [sparkRewardLumens, setSparkRewardLumens] = useState(100);
    const [battleJoinedAtMs, setBattleJoinedAtMs] = useState<number | null>(null);
    const [summaryLoadAtMs, setSummaryLoadAtMs] = useState<number | null>(null);
    const [isBrowserOnline, setIsBrowserOnline] = useState(
        typeof window === 'undefined' ? true : window.navigator.onLine,
    );
    const domeCenter = useMemo(
        () => (performanceTier === 'low' ? { x: 0.5, y: 0.6 } : BASE_DOME_CENTER),
        [performanceTier]
    );
    const domeRadius = performanceTier === 'low' ? 0.29 : BASE_DOME_RADIUS;
    const domeVisualScale = performanceTier === 'low' ? 1.22 : BASE_DOME_VISUAL_SCALE;

    const enemyLayerRef = useRef<EnemyLayerHandle>(null);
    const hitIdRef = useRef(0);
    const comboResetTimeoutRef = useRef<number | null>(null);
    const battleSyncTimerRef = useRef<number | null>(null);
    const battleJoinRetryTimerRef = useRef<number | null>(null);
    const finalReportTimerRef = useRef<number | null>(null);
    const finalReportSentRef = useRef(false);
    const pendingBattleReportRef = useRef<PendingBattleReportChunk | null>(null);
    const nextBattleReportSequenceRef = useRef(1);
    const lastBattleIdRef = useRef<string | null>(null);
    const lastBattleSyncWindowKeyRef = useRef<string | null>(null);
    const summaryRequestedRef = useRef<string | null>(null);
    const sparkCollectingRef = useRef(false);
    const baddieIdRef = useRef(0);
    const domeBlinkTimeoutRef = useRef<number | null>(null);
    const baddiesRef = useRef<typeof baddies>([]);
    const processedSparkIdsRef = useRef<Set<string>>(new Set());
    const processedBaddieWaveIdsRef = useRef<Set<string>>(new Set());
    const actedVoiceIdsRef = useRef<Set<string>>(new Set());
    const finalizedVoiceIdsRef = useRef<Set<string>>(new Set());
    const lastVoiceCommandRef = useRef<BattleScenarioVoiceCommand | null>(null);
    const serverOffsetMsRef = useRef<number>(0);
    const battleStartResourcesRef = useRef<{ lumens: number | null; sc: number | null; stars: number | null }>({
        lumens: null,
        sc: null,
        stars: null,
    });
    const battleSyncSlotRef = useRef(0);
    const battleSyncSlotCountRef = useRef(60);
    const battleSyncIntervalSecondsRef = useRef(BATTLE_REPORT_INTERVAL_SECONDS);
    const battleFinalReportAcceptSecondsRef = useRef(60);
    const battleFinalReportRetryIntervalMsRef = useRef(FINAL_REPORT_RETRY_INTERVAL_MS);
    const battleFinalReportWindowCapacityRef = useRef(2000);
    const summaryLoadTimerRef = useRef<number | null>(null);
    const lastShotTelemetryRef = useRef<{ at: number; screenX: number; screenY: number } | null>(null);
    const summaryModalClicksRef = useRef<Array<{ at: number; x: number; y: number }>>([]);
    const summaryBurstReportedRef = useRef(false);
    // UI shows confirmed server damage plus locally predicted hits that are still waiting for reconciliation.
    const confirmedUserDamageRef = useRef(0);
    const pendingUserDamageRef = useRef(0);
    const predictedLumensRef = useRef(0);
    const comboCountRef = useRef(0);
    const comboSeriesDamageRef = useRef(0);
    const comboUpdatedAtRef = useRef<number | null>(null);
    const comboX2StartedAtRef = useRef<number | null>(null);
    const comboX2MaxDurationRef = useRef(0);
    const phoenixStageRef = useRef(0);
    const reportAccRef = useRef<BattleMinuteReportAccumulator>(createEmptyBattleMinuteReport());
    const damageHudTimerRef = useRef<number | null>(null);
    const lumensHudTimerRef = useRef<number | null>(null);
    const inFlightDamageBatchesRef = useRef<InFlightDamageBatch[]>([]);
    const shotPreviewRef = useRef<Map<string, ShotPreview>>(new Map());
    const battleJoinedRef = useRef(false);
    const joinRequestedAtRef = useRef<string | null>(null);
    const battleJoinedAtIsoRef = useRef<string | null>(null);
    const heartbeatFailCountRef = useRef(0);
    const battleProgressPersistTimerRef = useRef<number | null>(null);
    const pendingBattleProgressOverridesRef = useRef<BattleProgressPersistOverrides | null>(null);
    const hydratedBattleProgressKeyRef = useRef<string | null>(null);
    const [connectionLost, setConnectionLost] = useState(false);

    const getBattleProgressStorageKey = useCallback((battleIdOverride?: string | null) => {
        const safeBattleId = String(battleIdOverride ?? battleId ?? '').trim();
        const safeUserId = String(user?._id || '').trim();
        if (!safeBattleId || !safeUserId) return null;
        return `${BATTLE_PROGRESS_STORAGE_PREFIX}:${safeUserId}:${safeBattleId}`;
    }, [battleId, user?._id]);

    const clearBattleProgress = useCallback((battleIdOverride?: string | null) => {
        if (typeof window === 'undefined') return;
        const key = getBattleProgressStorageKey(battleIdOverride);
        if (!key) return;
        window.localStorage.removeItem(key);
    }, [getBattleProgressStorageKey]);

    const applyServerNow = useCallback((serverNowMs: unknown) => {
        if (!Number.isFinite(Number(serverNowMs))) return;
        serverOffsetMsRef.current = Math.floor(Number(serverNowMs) - Date.now());
    }, []);

    const computeBattleSummaryLoadAtMs = useCallback((endsAtMsOverride?: number | null) => {
        const safeEndsAtMs = endsAtMsOverride ?? battleEndsAtMs;
        if (safeEndsAtMs == null) return null;
        return Math.max(Date.now(), Math.floor(safeEndsAtMs));
    }, [battleEndsAtMs]);

    const getDisplayedUserDamageValue = useCallback((userDamageOverride?: number) => {
        return Math.max(
            0,
            Math.round(
                userDamageOverride
                ?? (confirmedUserDamageRef.current + pendingUserDamageRef.current),
            ),
        );
    }, []);

    const readBattleProgress = useCallback((battleIdOverride?: string | null) => {
        if (typeof window === 'undefined') return null;
        const safeBattleId = String(battleIdOverride ?? battleId ?? lastBattleIdRef.current ?? '').trim();
        const safeUserId = String(user?._id || '').trim();
        const key = getBattleProgressStorageKey(safeBattleId);
        if (!safeBattleId || !safeUserId || !key) return null;

        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            return normalizeStoredBattleProgress(JSON.parse(raw), {
                battleId: safeBattleId,
                userId: safeUserId,
            });
        } catch {
            return null;
        }
    }, [battleId, getBattleProgressStorageKey, user?._id]);

    const syncUserBattleEconomy = useCallback((summary: BattleSummary | null, battleIdOverride?: string | null) => {
        if (!summary || !user) return;

        const snapshot = readBattleProgress(battleIdOverride || summary.battleId);
        const nextLumens = snapshot
            ? Math.max(0, Math.round(Number(snapshot.predictedLumens) || 0))
            : Math.max(0, Math.round(Number(predictedLumensRef.current) || Number(user.lumens) || 0));
        const baseSc = snapshot?.startSc ?? battleStartResourcesRef.current.sc ?? Math.max(0, Math.floor(Number(user.sc) || 0));
        const nextSc = Math.max(
            Math.max(0, Math.floor(Number(user.sc) || 0)),
            Math.max(0, Math.floor(Number(baseSc) || 0)) + Math.max(0, Math.floor(Number(summary.rewardSc) || 0)),
        );

        if (
            nextLumens === Math.max(0, Math.round(Number(user.lumens) || 0))
            && nextSc === Math.max(0, Math.floor(Number(user.sc) || 0))
        ) {
            return;
        }

        updateUser({
            ...user,
            lumens: nextLumens,
            sc: nextSc,
        });
    }, [readBattleProgress, updateUser, user]);

    const flushBattleProgress = useCallback((overrides?: BattleProgressPersistOverrides | null) => {
        if (typeof window === 'undefined') return;
        const safeBattleId = String(battleId || lastBattleIdRef.current || '').trim();
        const safeUserId = String(user?._id || '').trim();
        const key = getBattleProgressStorageKey(safeBattleId);
        if (!safeBattleId || !safeUserId || !key) return;

        const merged = overrides || {};
        const pendingReport = merged.pendingReport === undefined
            ? pendingBattleReportRef.current
            : merged.pendingReport;
        const report = merged.report === undefined
            ? reportAccRef.current
            : merged.report;
        const joinedAtIso = merged.joinedAtIso === undefined
            ? battleJoinedAtIsoRef.current
            : merged.joinedAtIso;
        const joinedAtMsToPersist = merged.battleJoinedAtMs === undefined
            ? battleJoinedAtMs
            : merged.battleJoinedAtMs;

        const payload: StoredBattleProgress = {
            version: 1,
            battleId: safeBattleId,
            userId: safeUserId,
            savedAt: Date.now(),
            joinedAtIso: joinedAtIso || null,
            battleJoinedAtMs: joinedAtMsToPersist == null ? null : Math.max(0, Math.floor(Number(joinedAtMsToPersist) || 0)),
            startLumens: merged.startLumens === undefined
                ? battleStartResourcesRef.current.lumens
                : merged.startLumens ?? null,
            startSc: merged.startSc === undefined
                ? battleStartResourcesRef.current.sc
                : merged.startSc ?? null,
            startStars: merged.startStars === undefined
                ? battleStartResourcesRef.current.stars
                : merged.startStars ?? null,
            confirmedUserDamage: merged.confirmedUserDamage === undefined
                ? Math.max(0, Math.round(confirmedUserDamageRef.current))
                : Math.max(0, Math.round(Number(merged.confirmedUserDamage) || 0)),
            pendingUserDamage: merged.pendingUserDamage === undefined
                ? Math.max(0, Math.round(pendingUserDamageRef.current))
                : Math.max(0, Math.round(Number(merged.pendingUserDamage) || 0)),
            predictedLumens: merged.predictedLumens === undefined
                ? Math.max(0, Math.round(Number(predictedLumensRef.current) || 0))
                : Math.max(0, Math.round(Number(merged.predictedLumens) || 0)),
            comboCount: merged.comboCount === undefined
                ? Math.max(0, Math.round(comboCountRef.current))
                : Math.max(0, Math.round(Number(merged.comboCount) || 0)),
            comboSeriesDamage: merged.comboSeriesDamage === undefined
                ? Math.max(0, Math.round(comboSeriesDamageRef.current))
                : Math.max(0, Math.round(Number(merged.comboSeriesDamage) || 0)),
            comboUpdatedAt: merged.comboUpdatedAt === undefined
                ? comboUpdatedAtRef.current
                : merged.comboUpdatedAt ?? null,
            comboX2StartedAt: merged.comboX2StartedAt === undefined
                ? comboX2StartedAtRef.current
                : merged.comboX2StartedAt ?? null,
            comboX2MaxDuration: merged.comboX2MaxDuration === undefined
                ? Math.max(0, Math.round(comboX2MaxDurationRef.current))
                : Math.max(0, Math.round(Number(merged.comboX2MaxDuration) || 0)),
            phoenixStage: merged.phoenixStage === undefined
                ? Math.max(0, Math.round(phoenixStageRef.current))
                : Math.max(0, Math.round(Number(merged.phoenixStage) || 0)),
            report: cloneBattleMinuteReport(report || createEmptyBattleMinuteReport()),
            pendingReport: pendingReport
                ? {
                    sequence: Math.max(1, Math.floor(Number(pendingReport.sequence) || 1)),
                    report: cloneBattleMinuteReport(pendingReport.report || createEmptyBattleMinuteReport()),
                }
                : null,
            nextReportSequence: merged.nextReportSequence === undefined
                ? Math.max(1, Math.floor(Number(nextBattleReportSequenceRef.current) || 1))
                : Math.max(1, Math.floor(Number(merged.nextReportSequence) || 1)),
            processedSparkIds: merged.processedSparkIds === undefined
                ? Array.from(processedSparkIdsRef.current)
                : merged.processedSparkIds,
            processedBaddieWaveIds: merged.processedBaddieWaveIds === undefined
                ? Array.from(processedBaddieWaveIdsRef.current)
                : merged.processedBaddieWaveIds,
            actedVoiceIds: merged.actedVoiceIds === undefined
                ? Array.from(actedVoiceIdsRef.current)
                : merged.actedVoiceIds,
            finalizedVoiceIds: merged.finalizedVoiceIds === undefined
                ? Array.from(finalizedVoiceIdsRef.current)
                : merged.finalizedVoiceIds,
        };

        try {
            window.localStorage.setItem(key, JSON.stringify(payload));
        } catch {
        }
    }, [battleId, battleJoinedAtMs, getBattleProgressStorageKey, user?._id]);

    const persistBattleProgress = useCallback((overrides?: BattleProgressPersistOverrides) => {
        const nextOverrides = {
            ...(pendingBattleProgressOverridesRef.current || {}),
            ...(overrides || {}),
        };
        pendingBattleProgressOverridesRef.current = nextOverrides;
        if (battleProgressPersistTimerRef.current != null) {
            return;
        }
        battleProgressPersistTimerRef.current = window.setTimeout(() => {
            battleProgressPersistTimerRef.current = null;
            const pendingOverrides = pendingBattleProgressOverridesRef.current;
            pendingBattleProgressOverridesRef.current = null;
            flushBattleProgress(pendingOverrides);
        }, 120);
    }, [flushBattleProgress]);

    const applyStoredBattleProgress = useCallback((snapshot: StoredBattleProgress | null) => {
        if (!snapshot) return false;
        battleStartResourcesRef.current = {
            lumens: snapshot.startLumens,
            sc: snapshot.startSc,
            stars: snapshot.startStars,
        };
        confirmedUserDamageRef.current = Math.max(0, snapshot.confirmedUserDamage);
        pendingUserDamageRef.current = Math.max(0, snapshot.pendingUserDamage);
        predictedLumensRef.current = Math.max(0, snapshot.predictedLumens);
        comboCountRef.current = Math.max(0, snapshot.comboCount);
        comboSeriesDamageRef.current = Math.max(0, snapshot.comboSeriesDamage);
        comboUpdatedAtRef.current = snapshot.comboUpdatedAt;
        comboX2StartedAtRef.current = snapshot.comboX2StartedAt;
        comboX2MaxDurationRef.current = Math.max(0, snapshot.comboX2MaxDuration);
        phoenixStageRef.current = Math.max(0, snapshot.phoenixStage);
        reportAccRef.current = cloneBattleMinuteReport(snapshot.report);
        pendingBattleReportRef.current = snapshot.pendingReport
            ? {
                sequence: Math.max(1, Math.floor(Number(snapshot.pendingReport.sequence) || 1)),
                report: cloneBattleMinuteReport(snapshot.pendingReport.report),
            }
            : null;
        nextBattleReportSequenceRef.current = Math.max(
            pendingBattleReportRef.current ? pendingBattleReportRef.current.sequence + 1 : 1,
            Math.max(1, Math.floor(Number(snapshot.nextReportSequence) || 1)),
        );
        processedSparkIdsRef.current = new Set(snapshot.processedSparkIds);
        processedBaddieWaveIdsRef.current = new Set(snapshot.processedBaddieWaveIds);
        actedVoiceIdsRef.current = new Set(snapshot.actedVoiceIds);
        finalizedVoiceIdsRef.current = new Set(snapshot.finalizedVoiceIds);
        battleJoinedAtIsoRef.current = snapshot.joinedAtIso || null;
        if (snapshot.battleJoinedAtMs != null) {
            setBattleJoinedAtMs(snapshot.battleJoinedAtMs);
        }
        setComboCount(Math.max(0, snapshot.comboCount));
        setUserDamage(getDisplayedUserDamageValue(snapshot.confirmedUserDamage + snapshot.pendingUserDamage));
        setDisplayedLumens(Math.max(0, Math.round(Number(snapshot.predictedLumens) || 0)));
        return true;
    }, [getDisplayedUserDamageValue]);

    const hasMeaningfulBattleProgress = useCallback(() => {
        if (confirmedUserDamageRef.current > 0 || pendingUserDamageRef.current > 0) {
            return true;
        }
        if (!isBattleMinuteReportEmpty(reportAccRef.current)) {
            return true;
        }
        const startLumens = battleStartResourcesRef.current.lumens;
        if (startLumens != null && Math.round(Number(predictedLumensRef.current) || 0) !== Math.round(Number(startLumens) || 0)) {
            return true;
        }
        return false;
    }, []);

    const applyBattlePersonalState = useCallback((snapshot: BattlePersonalState | null, options?: { preferServerValues?: boolean }) => {
        if (!snapshot) return false;

        if (snapshot.startLumens != null || snapshot.startSc != null || snapshot.startStars != null) {
            battleStartResourcesRef.current = {
                lumens: snapshot.startLumens ?? battleStartResourcesRef.current.lumens,
                sc: snapshot.startSc ?? battleStartResourcesRef.current.sc,
                stars: snapshot.startStars ?? battleStartResourcesRef.current.stars,
            };
        }

        if (snapshot.joinedAt && !battleJoinedAtIsoRef.current) {
            battleJoinedAtIsoRef.current = snapshot.joinedAt;
        }
        if (snapshot.joinedAt && battleJoinedAtMs == null) {
            setBattleJoinedAtMs(new Date(snapshot.joinedAt).getTime() + serverOffsetMsRef.current);
        }

        const shouldHydrateFromServer = Boolean(options?.preferServerValues) || !hasMeaningfulBattleProgress();
        if (!shouldHydrateFromServer) {
            persistBattleProgress({
                joinedAtIso: battleJoinedAtIsoRef.current,
                battleJoinedAtMs: battleJoinedAtMs ?? (snapshot.joinedAt ? new Date(snapshot.joinedAt).getTime() + serverOffsetMsRef.current : null),
                startLumens: battleStartResourcesRef.current.lumens,
                startSc: battleStartResourcesRef.current.sc,
                startStars: battleStartResourcesRef.current.stars,
            });
            return false;
        }

        confirmedUserDamageRef.current = Math.max(0, snapshot.confirmedDamage);
        pendingUserDamageRef.current = 0;
        if (snapshot.confirmedLumens != null) {
            predictedLumensRef.current = Math.max(0, snapshot.confirmedLumens);
            setDisplayedLumens(Math.max(0, snapshot.confirmedLumens));
        } else if (battleStartResourcesRef.current.lumens != null) {
            predictedLumensRef.current = Math.max(0, Number(battleStartResourcesRef.current.lumens) || 0);
            setDisplayedLumens(Math.max(0, Number(battleStartResourcesRef.current.lumens) || 0));
        }
        setUserDamage(Math.max(0, snapshot.confirmedDamage));
        persistBattleProgress({
            joinedAtIso: battleJoinedAtIsoRef.current,
            battleJoinedAtMs: battleJoinedAtMs ?? (snapshot.joinedAt ? new Date(snapshot.joinedAt).getTime() + serverOffsetMsRef.current : null),
            startLumens: battleStartResourcesRef.current.lumens,
            startSc: battleStartResourcesRef.current.sc,
            startStars: battleStartResourcesRef.current.stars,
            confirmedUserDamage: confirmedUserDamageRef.current,
            pendingUserDamage: 0,
            predictedLumens: snapshot.confirmedLumens ?? predictedLumensRef.current,
        });
        return true;
    }, [battleJoinedAtMs, hasMeaningfulBattleProgress, persistBattleProgress]);

    useEffect(() => {
        const flushNow = () => {
            if (battleProgressPersistTimerRef.current != null) {
                window.clearTimeout(battleProgressPersistTimerRef.current);
                battleProgressPersistTimerRef.current = null;
            }
            const pendingOverrides = pendingBattleProgressOverridesRef.current;
            pendingBattleProgressOverridesRef.current = null;
            flushBattleProgress(pendingOverrides);
        };

        window.addEventListener('pagehide', flushNow);
        window.addEventListener('beforeunload', flushNow);
        return () => {
            window.removeEventListener('pagehide', flushNow);
            window.removeEventListener('beforeunload', flushNow);
            flushNow();
        };
    }, [flushBattleProgress]);

    const upsertVoiceResult = useCallback((result: BattleVoiceResult) => {
        const nextResults = [...reportAccRef.current.voiceResults.filter((item) => item.id !== result.id), result];
        reportAccRef.current.voiceResults = nextResults;
        finalizedVoiceIdsRef.current.add(result.id);
        persistBattleProgress();
    }, [persistBattleProgress]);

    const finalizeVoiceCommandResult = useCallback((command: BattleScenarioVoiceCommand | null) => {
        if (!command || finalizedVoiceIdsRef.current.has(command.id)) {
            return;
        }
        const acted = actedVoiceIdsRef.current.has(command.id);
        const success = command.requireShot ? acted : !acted;
        upsertVoiceResult({
            id: command.id,
            text: command.text,
            acted,
            success,
        });
    }, [upsertVoiceResult]);

    const loadBattleSummary = useCallback(async (id: string, options?: { silent?: boolean }) => {
        try {
            setSummaryLoading(true);
            const data = await apiGet<BattleSummaryPayload>(`/battles/summary?battleId=${id}`);
            if (data.pending) {
                const retryAfterMs = Math.max(250, Math.floor(Number(data.retryAfterMs) || 1000));
                setSummaryLoadAtMs(Date.now() + retryAfterMs);
                return false;
            }
            const nextSummary = parseBattleSummaryPayload(data, battleSummary, language);
            if (!nextSummary) {
                setSummaryLoadAtMs(Date.now() + 1000);
                return false;
            }
            syncUserBattleEconomy(nextSummary, id);
            setBattleSummary(nextSummary);
            setSummaryLoadAtMs(null);
            clearBattleProgress(id);
            return true;
        } catch (e: unknown) {
            console.error('Failed to fetch battle summary:', e);
            if (!options?.silent) {
                const message = e instanceof Error ? e.message : '';
                toast.error(t('common.error'), message || t('battle.failed_get_result'));
            }
            return false;
        } finally {
            setSummaryLoading(false);
        }
    }, [battleSummary, clearBattleProgress, language, syncUserBattleEconomy, t, toast]);

    const redirectToTree = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.location.replace(localePath('/tree'));
    }, [localePath]);

    useEffect(() => {
        if (!socket) return;

        const onBattleSummaryReady = (payload: BattleSummaryPayload) => {
            const payloadBattleId = typeof payload?.battleId === 'string' ? payload.battleId : '';
            const currentBattleId = String(lastBattleIdRef.current || battleId || '').trim();
            if (!payloadBattleId || !currentBattleId || payloadBattleId !== currentBattleId) {
                return;
            }

            setBattleSummary((previous) => {
                const nextSummary = parseBattleSummaryPayload(payload, previous, language) || previous;
                syncUserBattleEconomy(nextSummary, payloadBattleId);
                return nextSummary;
            });
            summaryRequestedRef.current = payloadBattleId;
            setSummaryLoadAtMs(null);
            clearBattleProgress(payloadBattleId);
        };

        socket.on('battle:summary-ready', onBattleSummaryReady);
        return () => {
            socket.off('battle:summary-ready', onBattleSummaryReady);
        };
    }, [battleId, clearBattleProgress, language, socket, syncUserBattleEconomy]);

    const sealPendingBattleReport = useCallback(() => {
        if (pendingBattleReportRef.current) {
            return pendingBattleReportRef.current;
        }
        if (isBattleMinuteReportEmpty(reportAccRef.current)) {
            return null;
        }
        const chunk: PendingBattleReportChunk = {
            sequence: nextBattleReportSequenceRef.current,
            report: cloneBattleMinuteReport(reportAccRef.current),
        };
        nextBattleReportSequenceRef.current += 1;
        pendingBattleReportRef.current = chunk;
        reportAccRef.current = createEmptyBattleMinuteReport(chunk.report?.intervalSeconds || BATTLE_REPORT_INTERVAL_SECONDS);
        return chunk;
    }, []);

    const joinBattle = useCallback(async () => {
        try {
            if (!joinRequestedAtRef.current) {
                joinRequestedAtRef.current = new Date().toISOString();
            }
            const data = await apiPost<{
                ok: boolean;
                queued?: boolean;
                retryAfterMs?: number;
                battleId: string;
                serverNowMs?: number;
                battleStartsAtMs?: number | null;
                joinedAt?: string | null;
                personalState?: BattlePersonalState | null;
                durationSeconds: number;
                timeLeftMs?: number;
                attendanceCount: number;
                syncSlot?: number;
                syncSlotCount?: number;
                syncIntervalSeconds?: number;
                finalReportAcceptSeconds?: number;
                finalReportRetryIntervalMs?: number;
                finalReportWindowCapacity?: number;
                scenario?: BattleScenario | null;
            }>(
                '/battles/join',
                { joinedAt: joinRequestedAtRef.current },
                { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS },
            );

            if (data.queued) {
                if (battleJoinRetryTimerRef.current != null) {
                    window.clearTimeout(battleJoinRetryTimerRef.current);
                    battleJoinRetryTimerRef.current = null;
                }
                const retryAfterMs = Math.max(250, Math.floor(Number(data.retryAfterMs) || 2000));
                battleJoinRetryTimerRef.current = window.setTimeout(() => {
                    battleJoinRetryTimerRef.current = null;
                    void joinBattle();
                }, retryAfterMs);
                return;
            }

            applyServerNow(data.serverNowMs);
            const nextPersonalState = normalizeBattlePersonalState(data.personalState);

            if (data.ok) {
                const joinedAtIso = joinRequestedAtRef.current;
                joinRequestedAtRef.current = null;
                battleJoinedAtIsoRef.current = typeof data.joinedAt === 'string' && data.joinedAt
                    ? data.joinedAt
                    : joinedAtIso;
                if (battleJoinRetryTimerRef.current != null) {
                    window.clearTimeout(battleJoinRetryTimerRef.current);
                    battleJoinRetryTimerRef.current = null;
                }
                battleJoinedRef.current = true;
                const joinedAtMs = battleJoinedAtIsoRef.current
                    ? new Date(battleJoinedAtIsoRef.current).getTime() + serverOffsetMsRef.current
                    : Date.now() + serverOffsetMsRef.current;
                setBattleJoinedAtMs(joinedAtMs);
                battleSyncSlotRef.current = Math.max(0, Math.floor(Number(data.syncSlot) || 0));
                battleSyncSlotCountRef.current = Math.max(1, Math.floor(Number(data.syncSlotCount) || 60));
                battleSyncIntervalSecondsRef.current = Math.max(1, Math.floor(Number(data.syncIntervalSeconds) || BATTLE_REPORT_INTERVAL_SECONDS));
                battleFinalReportAcceptSecondsRef.current = Math.max(0, Math.floor(Number(data.finalReportAcceptSeconds) || 60));
                battleFinalReportRetryIntervalMsRef.current = Math.max(250, Math.floor(Number(data.finalReportRetryIntervalMs) || FINAL_REPORT_RETRY_INTERVAL_MS));
                battleFinalReportWindowCapacityRef.current = Math.max(1, Math.floor(Number(data.finalReportWindowCapacity) || 2000));
                const durationMs = Math.max(0, Math.floor(Number(data.durationSeconds) || 0) * 1000);
                const safeTimeLeftMs = Math.max(0, Math.floor(Number(data.timeLeftMs) || 0));
                const nextBattleStartsAtMs = Number.isFinite(Number(data.battleStartsAtMs))
                    ? Math.max(0, Math.floor(Number(data.battleStartsAtMs) || 0))
                    : (durationMs > 0
                        ? Math.max(0, Math.floor((Date.now() + serverOffsetMsRef.current + safeTimeLeftMs) - durationMs))
                        : null);
                const nextBattleEndsAtMs = durationMs > 0
                    ? Math.max(
                        Date.now() + serverOffsetMsRef.current,
                        Math.floor((nextBattleStartsAtMs ?? 0) + durationMs),
                    )
                    : null;
                if (nextBattleStartsAtMs != null) {
                    setBattleStartsAtMs(nextBattleStartsAtMs);
                }
                if (nextBattleEndsAtMs != null) {
                    setBattleEndsAtMs(nextBattleEndsAtMs);
                    setBattleTimeLeftMs(Math.max(0, nextBattleEndsAtMs - (Date.now() + serverOffsetMsRef.current)));
                }
                const parsedScenario = parseBattleScenario(data.scenario);
                setBattleScenario(parsedScenario);
                const elapsedAtJoinMs = nextBattleStartsAtMs == null
                    ? 0
                    : Math.max(0, Math.round(joinedAtMs - nextBattleStartsAtMs));
                const pastScenarioState = getScenarioPastEventState(parsedScenario, elapsedAtJoinMs);
                processedSparkIdsRef.current = new Set([
                    ...pastScenarioState.pastSparkIds,
                    ...reportAccRef.current.sparkIds,
                ]);
                processedBaddieWaveIdsRef.current = new Set(pastScenarioState.pastBaddieWaveIds);
                actedVoiceIdsRef.current = new Set();
                finalizedVoiceIdsRef.current = new Set((reportAccRef.current.voiceResults || []).map((item) => item.id));
                lastVoiceCommandRef.current = null;
                setSpark(null);
                setBaddies([]);
                if (parsedScenario) {
                    setSparkRewardLumens(Math.max(0, parsedScenario.sparkRewardLumens || 0));
                }
                const nextAttendanceCount = Math.max(0, Number(data.attendanceCount) || 0);
                setAttendanceCount(nextAttendanceCount);
                setSummaryLoadAtMs(null);
                if (nextPersonalState) {
                    applyBattlePersonalState(nextPersonalState, {
                        preferServerValues: !Boolean(readBattleProgress(data.battleId || battleId)),
                    });
                }
                persistBattleProgress({
                    joinedAtIso: battleJoinedAtIsoRef.current,
                    battleJoinedAtMs: joinedAtMs,
                });
            }
        } catch (e) {
            console.error('Join battle error:', e);
        }
    }, [applyBattlePersonalState, applyServerNow, battleId, persistBattleProgress, readBattleProgress]);

    const sendHeartbeat = useCallback(async () => {
        if (!battleId || !battleJoinedRef.current) return;
        if (battleEndsAtMs) {
            const nowByServer = Date.now() + serverOffsetMsRef.current;
            if (nowByServer >= battleEndsAtMs) {
                return;
            }
        }
        try {
            const pendingChunk = sealPendingBattleReport();
            const data = await apiPost<{
                ok: boolean;
                serverNowMs?: number;
                timeLeftMs: number;
                attendanceCount: number;
                acceptedReport?: boolean;
                ignoredReport?: boolean;
                personalState?: BattlePersonalState | null;
            }>(
                '/battles/heartbeat',
                pendingChunk
                    ? {
                        battleId,
                        reportSequence: pendingChunk.sequence,
                        report: pendingChunk.report,
                    }
                    : { battleId },
                { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS },
            );

            if (data.ok) {
                applyServerNow(data.serverNowMs);
                if (pendingChunk && (data.acceptedReport || data.ignoredReport) && pendingBattleReportRef.current?.sequence === pendingChunk.sequence) {
                    pendingBattleReportRef.current = null;
                }
                heartbeatFailCountRef.current = 0;
                setConnectionLost(false);
                const safeTimeLeftMs = Math.max(0, Math.floor(Number(data.timeLeftMs) || 0));
                const localEndsAtMs = Date.now() + serverOffsetMsRef.current + safeTimeLeftMs;
                setBattleEndsAtMs(localEndsAtMs);
                setBattleTimeLeftMs(safeTimeLeftMs);
                setAttendanceCount(data.attendanceCount || 0);
                const nextPersonalState = normalizeBattlePersonalState(data.personalState);
                if (nextPersonalState) {
                    applyBattlePersonalState(nextPersonalState);
                }
            }
        } catch (e) {
            console.error('Heartbeat error:', e);
            heartbeatFailCountRef.current += 1;
            if (heartbeatFailCountRef.current >= 2) {
                setConnectionLost(true);
            }
        }
    }, [applyBattlePersonalState, applyServerNow, battleEndsAtMs, battleId, sealPendingBattleReport]);

    const sendFinalReport = useCallback(async () => {
        if (!battleId || !battleJoinedRef.current || finalReportSentRef.current) return;
        if (!isBrowserOnline) return;

        const reportWindowEndMs = battleEndsAtMs
            ? battleEndsAtMs + (Math.max(0, Math.floor(Number(battleFinalReportAcceptSecondsRef.current) || 60)) * 1000)
            : null;
        const nowByServer = Date.now() + serverOffsetMsRef.current;
        if (!battleEndsAtMs || nowByServer < battleEndsAtMs) return;
        if (reportWindowEndMs != null && nowByServer > reportWindowEndMs) return;

        if (lastVoiceCommandRef.current) {
            finalizeVoiceCommandResult(lastVoiceCommandRef.current);
            lastVoiceCommandRef.current = null;
        }

        const comboMultiplier = getComboMultiplier(comboCountRef.current);
        const comboSeriesDamage = Math.max(0, Math.round(comboSeriesDamageRef.current));
        if (comboMultiplier > 1 && comboSeriesDamage > 0) {
            const comboBonusDamage = Math.max(0, Math.round(comboSeriesDamage * (comboMultiplier - 1)));
            if (comboBonusDamage > 0) {
                pendingUserDamageRef.current += comboBonusDamage;
                reportAccRef.current.damageDelta += comboBonusDamage;
            }
        }
        if (comboX2StartedAtRef.current != null && comboUpdatedAtRef.current != null) {
            const heldSeconds = Math.max(0, Math.floor((comboUpdatedAtRef.current - comboX2StartedAtRef.current) / 1000));
            comboX2MaxDurationRef.current = Math.max(comboX2MaxDurationRef.current, heldSeconds);
            reportAccRef.current.heldComboX2MaxDuration = Math.max(reportAccRef.current.heldComboX2MaxDuration, comboX2MaxDurationRef.current);
            comboX2StartedAtRef.current = null;
        }
        if (comboCountRef.current > 0 || comboSeriesDamageRef.current > 0) {
            if (comboResetTimeoutRef.current != null) {
                window.clearTimeout(comboResetTimeoutRef.current);
                comboResetTimeoutRef.current = null;
            }
            comboCountRef.current = 0;
            comboSeriesDamageRef.current = 0;
            comboUpdatedAtRef.current = null;
            setComboCount(0);
            persistBattleProgress({ comboCount: 0, comboSeriesDamage: 0, comboUpdatedAt: null });
        }

        const pendingChunk = sealPendingBattleReport();
        if (!pendingChunk) {
            finalReportSentRef.current = true;
            return;
        }

        try {
            const res = await apiPost<{
                ok?: boolean;
                accepted?: boolean;
                ignored?: boolean;
                limited?: boolean;
                retryAfterMs?: number;
            }>('/battles/damage', {
                battleId,
                action: 'final',
                reportSequence: pendingChunk.sequence,
                report: pendingChunk.report,
            }, { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS });

            if (res?.accepted || res?.ignored) {
                if (pendingBattleReportRef.current?.sequence === pendingChunk.sequence) {
                    pendingBattleReportRef.current = null;
                }
                finalReportSentRef.current = true;
                return;
            }

            const retryDelay = Math.max(
                FINAL_REPORT_RETRY_INTERVAL_MS,
                Math.floor(Number(res?.retryAfterMs) || Number(battleFinalReportRetryIntervalMsRef.current) || FINAL_REPORT_RETRY_INTERVAL_MS),
            );
            if (reportWindowEndMs != null && nowByServer > reportWindowEndMs) return;
            if (finalReportTimerRef.current != null) return;
            finalReportTimerRef.current = window.setTimeout(() => {
                finalReportTimerRef.current = null;
                void sendFinalReport();
            }, retryDelay);
            return;
        } catch (error) {
            void error;
        }

        if (reportWindowEndMs != null && nowByServer > reportWindowEndMs) return;
        if (finalReportTimerRef.current != null) return;

        const retryDelay = Math.max(
            FINAL_REPORT_RETRY_INTERVAL_MS,
            Math.floor(Number(battleFinalReportRetryIntervalMsRef.current) || FINAL_REPORT_RETRY_INTERVAL_MS),
        );
        finalReportTimerRef.current = window.setTimeout(() => {
            finalReportTimerRef.current = null;
            void sendFinalReport();
        }, retryDelay);
    }, [battleEndsAtMs, battleId, finalizeVoiceCommandResult, isBrowserOnline, persistBattleProgress, sealPendingBattleReport]);

    const flushDisplayedUserDamage = useCallback(() => {
        damageHudTimerRef.current = null;
        const nextDisplayDamage = Math.max(
            0,
            Math.round(getDisplayedUserDamageValue()),
        );
        setUserDamage(nextDisplayDamage);
    }, [getDisplayedUserDamageValue]);

    const syncDisplayedUserDamage = useCallback((mode: 'throttled' | 'immediate' = 'throttled') => {
        if (mode === 'immediate') {
            if (damageHudTimerRef.current != null) {
                window.clearTimeout(damageHudTimerRef.current);
                damageHudTimerRef.current = null;
            }
            flushDisplayedUserDamage();
            return;
        }

        if (damageHudTimerRef.current != null) return;
        damageHudTimerRef.current = window.setTimeout(flushDisplayedUserDamage, 60);
    }, [flushDisplayedUserDamage]);

    const flushDisplayedLumens = useCallback(() => {
        lumensHudTimerRef.current = null;
        setDisplayedLumens(Math.max(0, Math.round(Number(predictedLumensRef.current) || 0)));
    }, []);

    const syncDisplayedLumens = useCallback((mode: 'throttled' | 'immediate' = 'throttled') => {
        if (mode === 'immediate') {
            if (lumensHudTimerRef.current != null) {
                window.clearTimeout(lumensHudTimerRef.current);
                lumensHudTimerRef.current = null;
            }
            flushDisplayedLumens();
            return;
        }

        if (lumensHudTimerRef.current != null) return;
        lumensHudTimerRef.current = window.setTimeout(flushDisplayedLumens, 90);
    }, [flushDisplayedLumens]);

    const clearInFlightDamageBatches = useCallback(() => {
        inFlightDamageBatchesRef.current.forEach((batch) => {
            if (batch.timeoutId != null) {
                window.clearTimeout(batch.timeoutId);
            }
        });
        inFlightDamageBatchesRef.current = [];
    }, []);

    const addPendingUserDamage = useCallback((damageDelta: number) => {
        const safeDelta = Math.max(0, Math.round(damageDelta));
        if (!safeDelta) return;
        pendingUserDamageRef.current += safeDelta;
        syncDisplayedUserDamage();
    }, [syncDisplayedUserDamage]);

    const resetBattleDamageTracking = useCallback((nextConfirmedDamage = 0) => {
        if (battleJoinRetryTimerRef.current != null) {
            window.clearTimeout(battleJoinRetryTimerRef.current);
            battleJoinRetryTimerRef.current = null;
        }
        joinRequestedAtRef.current = null;
        clearInFlightDamageBatches();
        shotPreviewRef.current.clear();
        reportAccRef.current = createEmptyBattleMinuteReport(reportAccRef.current.intervalSeconds || BATTLE_REPORT_INTERVAL_SECONDS);
        pendingBattleReportRef.current = null;
        finalReportSentRef.current = false;
        nextBattleReportSequenceRef.current = 1;
        if (finalReportTimerRef.current != null) {
            window.clearTimeout(finalReportTimerRef.current);
            finalReportTimerRef.current = null;
        }
        if (battleProgressPersistTimerRef.current != null) {
            window.clearTimeout(battleProgressPersistTimerRef.current);
            battleProgressPersistTimerRef.current = null;
        }
        pendingBattleProgressOverridesRef.current = null;
        battleJoinedAtIsoRef.current = null;
        hydratedBattleProgressKeyRef.current = null;
        battleStartResourcesRef.current = { lumens: null, sc: null, stars: null };
        lastBattleSyncWindowKeyRef.current = null;
        confirmedUserDamageRef.current = Math.max(0, Math.round(nextConfirmedDamage));
        pendingUserDamageRef.current = 0;
        comboCountRef.current = 0;
        comboSeriesDamageRef.current = 0;
        comboUpdatedAtRef.current = null;
        comboX2StartedAtRef.current = null;
        comboX2MaxDurationRef.current = 0;
        phoenixStageRef.current = 0;
        processedSparkIdsRef.current = new Set();
        processedBaddieWaveIdsRef.current = new Set();
        actedVoiceIdsRef.current = new Set();
        finalizedVoiceIdsRef.current = new Set();
        lastVoiceCommandRef.current = null;
        predictedLumensRef.current = Math.max(0, Number(battleStartResourcesRef.current.lumens ?? user?.lumens ?? 0));
        setComboCount(0);
        setUserDamage(Math.max(0, confirmedUserDamageRef.current));
        syncDisplayedLumens('immediate');
    }, [clearInFlightDamageBatches, syncDisplayedLumens, user?.lumens]);

    useEffect(() => {
        if (isBattleActive && battleId) {
            return;
        }
        if (summaryVisible && battleId) {
            const storedBattleProgress = readBattleProgress(battleId);
            if (storedBattleProgress) {
                predictedLumensRef.current = Math.max(0, Number(storedBattleProgress.predictedLumens) || 0);
                syncDisplayedLumens('immediate');
                return;
            }
        }
        predictedLumensRef.current = Math.max(0, Number(user?.lumens ?? 0));
        syncDisplayedLumens('immediate');
    }, [battleId, isBattleActive, readBattleProgress, summaryVisible, syncDisplayedLumens, user?.lumens]);

    const pruneShotPreviews = useCallback(() => {
        const now = Date.now();
        for (const [shotId, preview] of shotPreviewRef.current.entries()) {
            if (now - preview.at > SHOT_PREVIEW_TTL_MS) {
                shotPreviewRef.current.delete(shotId);
            }
        }
    }, []);

    const updateShotPreview = useCallback((
        shotIdToUse: string,
        weaponIdToUse: number,
        chargeState: ShotChargeState,
        aimWorldPoint: BattleWorldPoint | null = null,
        countsTowardCombo = true,
    ) => {
        if (!shotIdToUse) return;
        pruneShotPreviews();
        const existing = shotPreviewRef.current.get(shotIdToUse);
        shotPreviewRef.current.set(shotIdToUse, {
            at: Date.now(),
            weaponId: weaponIdToUse,
            chargeState,
            aimWorldPoint: aimWorldPoint ?? existing?.aimWorldPoint ?? null,
            countsTowardCombo: Boolean(countsTowardCombo),
        });
    }, [pruneShotPreviews]);

    const battleDamageMultiplier = useMemo(() => {
        const branchName = String(user?.treeBranch || '').trim();
        if (!branchName) return 1;
        const totalDebuffPercent = battleInjuries.reduce((acc, injury) => {
            if (String(injury.branchName || '').trim() !== branchName) {
                return acc;
            }
            return acc + (Number(injury.debuffPercent) || 0);
        }, 0);
        return Math.max(0, 1 - totalDebuffPercent / 100);
    }, [battleInjuries, user?.treeBranch]);

    const damageBoostActive = useMemo(
        () => isBoostActiveForBattle(user?.shopBoosts?.battleDamage, battleId),
        [battleId, user?.shopBoosts?.battleDamage],
    );
    const lumensDiscountActive = useMemo(
        () => isBoostActiveForBattle(user?.shopBoosts?.battleLumensDiscount, battleId),
        [battleId, user?.shopBoosts?.battleLumensDiscount],
    );
    const weakZoneBoostActive = useMemo(
        () => isBoostActiveForBattle(user?.shopBoosts?.weakZoneDamage, battleId),
        [battleId, user?.shopBoosts?.weakZoneDamage],
    );

    const getEffectiveWeaponCost = useCallback((weaponIdToUse: number) => {
        const config = WEAPON_CONFIG[weaponIdToUse as keyof typeof WEAPON_CONFIG];
        if (!config) return 0;
        if (!lumensDiscountActive) return config.costLumens;
        return Math.max(1, Math.ceil(config.costLumens * 0.75));
    }, [lumensDiscountActive]);

    const resetCombo = useCallback(() => {
        if (comboResetTimeoutRef.current) {
            window.clearTimeout(comboResetTimeoutRef.current);
            comboResetTimeoutRef.current = null;
        }
        const comboMultiplier = getComboMultiplier(comboCountRef.current);
        const comboSeriesDamage = Math.max(0, Math.round(comboSeriesDamageRef.current));
        if (comboMultiplier > 1 && comboSeriesDamage > 0) {
            const comboBonusDamage = Math.max(0, Math.round(comboSeriesDamage * (comboMultiplier - 1)));
            if (comboBonusDamage > 0) {
                addPendingUserDamage(comboBonusDamage);
                reportAccRef.current.damageDelta += comboBonusDamage;
            }
        }
        if (comboX2StartedAtRef.current != null && comboUpdatedAtRef.current != null) {
            const heldSeconds = Math.max(0, Math.floor((comboUpdatedAtRef.current - comboX2StartedAtRef.current) / 1000));
            comboX2MaxDurationRef.current = Math.max(comboX2MaxDurationRef.current, heldSeconds);
            reportAccRef.current.heldComboX2MaxDuration = Math.max(reportAccRef.current.heldComboX2MaxDuration, comboX2MaxDurationRef.current);
            comboX2StartedAtRef.current = null;
        }
        if (phoenixStageRef.current === 1) {
            phoenixStageRef.current = 2;
            reportAccRef.current.phoenixStage = Math.max(reportAccRef.current.phoenixStage, phoenixStageRef.current);
        }
        comboCountRef.current = 0;
        comboSeriesDamageRef.current = 0;
        comboUpdatedAtRef.current = null;
        setComboCount(0);
        persistBattleProgress({ comboCount: 0, comboSeriesDamage: 0, comboUpdatedAt: null });
    }, [addPendingUserDamage, persistBattleProgress]);

    const scheduleComboReset = useCallback(() => {
        if (comboResetTimeoutRef.current) {
            window.clearTimeout(comboResetTimeoutRef.current);
        }
        comboResetTimeoutRef.current = window.setTimeout(() => {
            resetCombo();
        }, COMBO_RESET_MS);
    }, [resetCombo]);

    const bumpCombo = useCallback(() => {
        const nextCount = comboCountRef.current + 1;
        const nowMs = Date.now();
        comboCountRef.current = nextCount;
        comboUpdatedAtRef.current = nowMs;
        const nextMultiplier = getComboMultiplier(nextCount);
        reportAccRef.current.maxComboHits = Math.max(reportAccRef.current.maxComboHits, nextCount);
        reportAccRef.current.maxComboMultiplier = Math.max(reportAccRef.current.maxComboMultiplier, nextMultiplier);
        if (battleStartsAtMs != null) {
            const elapsedAtNowMs = Math.max(0, Math.round((nowMs + serverOffsetMsRef.current) - battleStartsAtMs));
            if (elapsedAtNowMs <= 30000 && nextMultiplier >= 1.5) {
                reportAccRef.current.reachedX1_5InFirst30s = true;
            }
        }
        if (nextMultiplier >= 2 && comboX2StartedAtRef.current == null) {
            comboX2StartedAtRef.current = nowMs;
            if (phoenixStageRef.current <= 0) {
                phoenixStageRef.current = 1;
            } else if (phoenixStageRef.current === 2) {
                phoenixStageRef.current = 3;
            }
            reportAccRef.current.phoenixStage = Math.max(reportAccRef.current.phoenixStage, phoenixStageRef.current);
        }
        setComboCount(nextCount);
        scheduleComboReset();
        return {
            count: nextCount,
            updatedAt: nowMs,
        };
    }, [battleStartsAtMs, scheduleComboReset]);

    const weaponAvailability = useMemo(() => ({
        1: true,
        2: displayedLumens >= getEffectiveWeaponCost(2),
        3: displayedLumens >= getEffectiveWeaponCost(3),
    }), [displayedLumens, getEffectiveWeaponCost]);

    const ensureShotChargeState = useCallback((weaponIdToUse: number, shotIdToUse: string) => {
        pruneShotPreviews();
        const existing = shotPreviewRef.current.get(shotIdToUse);
        if (existing) {
            return existing.chargeState;
        }

        const config = WEAPON_CONFIG[weaponIdToUse as keyof typeof WEAPON_CONFIG];
        if (!config) {
            updateShotPreview(shotIdToUse, weaponIdToUse, 'unavailable');
            return 'unavailable' as const;
        }

        const currentLumens = Math.max(0, Number(predictedLumensRef.current || 0));
        const effectiveCost = getEffectiveWeaponCost(weaponIdToUse);
        let chargeState: ShotChargeState = 'unavailable';

        if (currentLumens >= effectiveCost) {
            predictedLumensRef.current = currentLumens - effectiveCost;
            chargeState = 'charged';
        } else if (weaponIdToUse === 1) {
            chargeState = 'penalty';
        }

        updateShotPreview(shotIdToUse, weaponIdToUse, chargeState);
        syncDisplayedLumens();
        return chargeState;
    }, [getEffectiveWeaponCost, pruneShotPreviews, syncDisplayedLumens, updateShotPreview]);

    const getPredictedHitDamage = useCallback((event: EnemyHitEvent) => {
        const weaponIdToUse = Number(event.weaponId);
        const config = WEAPON_CONFIG[weaponIdToUse as keyof typeof WEAPON_CONFIG];
        if (!config || !event.shotId) {
            return 0;
        }

        const chargeState = ensureShotChargeState(weaponIdToUse, event.shotId);
        if (chargeState === 'unavailable') {
            return 0;
        }

        let inWeakZone = false;
        const activeWeakZone = weakZone as BattleWeakZone | null;
        if (
            activeWeakZone?.active &&
            activeWeakZone.center &&
            Number.isFinite(event.worldPoint?.x) &&
            Number.isFinite(event.worldPoint?.y)
        ) {
            const dx = Number(event.worldPoint.x) - activeWeakZone.center.x;
            const dy = Number(event.worldPoint.y) - activeWeakZone.center.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= activeWeakZone.radius) {
                inWeakZone = true;
            }
        }

        const penaltyMultiplier = chargeState === 'penalty' ? 0.5 : 1;
        let personalBaseDamage = config.damage;
        if (damageBoostActive) {
            personalBaseDamage *= 1.15;
        }
        if (user?.nightShift?.isServing) {
            personalBaseDamage *= 2;
        }
        personalBaseDamage *= battleDamageMultiplier * penaltyMultiplier;

        let totalDamage = personalBaseDamage;
        if (inWeakZone) {
            totalDamage += personalBaseDamage * 0.5;
            if (weakZoneBoostActive) {
                totalDamage += personalBaseDamage * 0.5;
            }
        }

        return Math.max(0, Math.round(totalDamage));
    }, [battleDamageMultiplier, damageBoostActive, ensureShotChargeState, user?.nightShift?.isServing, weakZone, weakZoneBoostActive]);

    useEffect(() => {
        const detectTier = () => {
            const nav = navigator as Navigator & { deviceMemory?: number };
            const memory = Number(nav.deviceMemory || 0);
            const cores = Number(nav.hardwareConcurrency || 0);
            const isMobile = window.innerWidth <= 900;

            if ((memory > 0 && memory <= 4) || (cores > 0 && cores <= 4) || isMobile) {
                setPerformanceTier('low');
                return;
            }
            if ((memory > 0 && memory <= 8) || (cores > 0 && cores <= 8)) {
                setPerformanceTier('medium');
                return;
            }
            setPerformanceTier('high');
        };

        detectTier();
        window.addEventListener('resize', detectTier);
        return () => window.removeEventListener('resize', detectTier);
    }, []);

    useEffect(() => {
        const syncVisibility = () => {
            setIsTabVisible(document.visibilityState !== 'hidden');
        };
        syncVisibility();
        document.addEventListener('visibilitychange', syncVisibility);
        return () => document.removeEventListener('visibilitychange', syncVisibility);
    }, []);

    useEffect(() => {
        const syncOnlineState = () => {
            const nextOnline = typeof window === 'undefined' ? true : window.navigator.onLine;
            setIsBrowserOnline(nextOnline);
        };

        syncOnlineState();
        window.addEventListener('online', syncOnlineState);
        window.addEventListener('offline', syncOnlineState);
        return () => {
            window.removeEventListener('online', syncOnlineState);
            window.removeEventListener('offline', syncOnlineState);
        };
    }, []);

    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyOverscroll = body.style.overscrollBehavior;

        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';

        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
            body.style.overscrollBehavior = prevBodyOverscroll;
        };
    }, []);

    const fetchBattle = useCallback(async () => {
        try {
            const data = await apiGet<unknown>('/battles/current', { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS });
            const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
            const status = typeof d.status === 'string' ? d.status : '';
            const battle = typeof d.battle === 'object' && d.battle !== null ? (d.battle as Record<string, unknown>) : {};
            applyServerNow(battle.serverNowMs);
            const battleIdValue = typeof battle._id === 'string' ? battle._id : '';
            const joinedAtIso = typeof battle.joinedAt === 'string' && battle.joinedAt.trim() ? battle.joinedAt : null;
            const nextPersonalState = normalizeBattlePersonalState(battle.personalState);
            if (status === 'active' && battleIdValue) {
                const previousBattleId = lastBattleIdRef.current;
                const isNewBattle = previousBattleId !== battleIdValue;
                const storedBattleProgress = readBattleProgress(battleIdValue);
                const parsedScenario = parseBattleScenario(battle.scenario);
                const injuries = Array.isArray(battle.injuries)
                    ? battle.injuries
                        .map((injury) => {
                            const row = injury && typeof injury === 'object'
                                ? injury as Record<string, unknown>
                                : {};
                            return {
                                branchName: String(row.branchName || ''),
                                debuffPercent: Number(row.debuffPercent) || 0,
                            };
                        })
                        .filter((injury) => Boolean(injury.branchName))
                    : [];
                setBattleId(battleIdValue);
                lastBattleIdRef.current = battleIdValue;
                setIsBattleActive(true);
                if (parsedScenario) {
                    setBattleScenario(parsedScenario);
                    setSparkRewardLumens(Math.max(0, parsedScenario.sparkRewardLumens || 0));
                }
                setBattleInjuries(injuries);
                const durationMs = Math.max(0, Math.floor(Number(battle.durationSeconds) || 0) * 1000);
                const timeLeftMs = Math.max(0, Math.floor(Number(battle.timeLeftMs) || 0));
                const parsedEndsAt = Date.now() + serverOffsetMsRef.current + timeLeftMs;
                const parsedStartsAt = durationMs > 0 ? parsedEndsAt - durationMs : null;
                if (joinedAtIso && !battleJoinedAtIsoRef.current) {
                    battleJoinedAtIsoRef.current = joinedAtIso;
                }
                if (joinedAtIso && !battleJoinedAtMs) {
                    setBattleJoinedAtMs(new Date(joinedAtIso).getTime() + serverOffsetMsRef.current);
                }
                setBattleEndsAtMs((prev) => {
                    const sameBattle = previousBattleId === battleIdValue;
                    if (!sameBattle || prev == null) return parsedEndsAt;
                    // Countdown must never be extended by periodic polling jitter.
                    if (parsedEndsAt > prev + 2000) return prev;
                    return parsedEndsAt;
                });
                setBattleStartsAtMs(parsedStartsAt ?? null);
                setBattleTimeLeftMs(timeLeftMs);
                setSummaryVisible(false);
                setBattleSummary(null);
                setSummaryLoadAtMs(null);
                summaryRequestedRef.current = null;
                if (isNewBattle) {
                    setSpark(null);
                    setBaddies([]);
                    setWeakZone(null);
                    setVoiceCommand(null);
                    setVoiceProgress(0);
                    setBattleJoinedAtMs(null);
                    lastBattleSyncWindowKeyRef.current = null;
                    if (!storedBattleProgress) {
                        resetBattleDamageTracking(0);
                    }
                    battleJoinedRef.current = false;
                    void joinBattle();
                }
                if (storedBattleProgress) {
                    applyStoredBattleProgress(storedBattleProgress);
                } else if (nextPersonalState) {
                    applyBattlePersonalState(nextPersonalState, {
                        preferServerValues: true,
                    });
                }
                setAttendanceCount(Number(battle.attendanceCount) || 0);
            } else if (status === 'final_window' && battleIdValue) {
                const injuries = Array.isArray(battle.injuries)
                    ? battle.injuries
                        .map((injury) => {
                            const row = injury && typeof injury === 'object'
                                ? injury as Record<string, unknown>
                                : {};
                            return {
                                branchName: String(row.branchName || ''),
                                debuffPercent: Number(row.debuffPercent) || 0,
                            };
                        })
                        .filter((injury) => Boolean(injury.branchName))
                    : [];
                setBattleId(battleIdValue);
                lastBattleIdRef.current = battleIdValue;
                setIsBattleActive(false);
                setBattleInjuries(injuries);
                const finalWindowLeftMs = Math.max(0, Math.floor(Number(battle.finalWindowTimeLeftMs) || FINAL_RESULTS_WAIT_MS));
                const finalWindowSeconds = Math.max(0, Math.floor(Number(battle.finalWindowSeconds) || 60));
                const serverNowMs = Date.now() + serverOffsetMsRef.current;
                const endedAtMs = serverNowMs - Math.max(0, (finalWindowSeconds * 1000) - finalWindowLeftMs);
                setBattleStartsAtMs(null);
                setBattleEndsAtMs(endedAtMs);
                setBattleTimeLeftMs(0);
                battleFinalReportAcceptSecondsRef.current = Math.max(0, Math.floor(Number(battle.finalReportAcceptSeconds) || battleFinalReportAcceptSecondsRef.current || 60));
                battleFinalReportRetryIntervalMsRef.current = Math.max(250, Math.floor(Number(battle.finalReportRetryIntervalMs) || battleFinalReportRetryIntervalMsRef.current || FINAL_REPORT_RETRY_INTERVAL_MS));
                battleFinalReportWindowCapacityRef.current = Math.max(1, Math.floor(Number(battle.finalReportWindowCapacity) || battleFinalReportWindowCapacityRef.current || 2000));
                setSummaryVisible(true);
                setSummaryLoadAtMs(Date.now());
                summaryRequestedRef.current = battleIdValue;
                setWeakZone(null);
                setSpark(null);
                setBaddies([]);
                setVoiceCommand(null);
                setVoiceProgress(0);
                setAttendanceCount(Number(battle.attendanceCount) || 0);
                setBattleJoinedAtMs(null);
                void loadBattleSummary(battleIdValue, { silent: true });
            } else {
                setIsBattleActive(false);
                setBattleScenario(null);
                setBattleInjuries([]);
                setWeakZone(null);
                setSpark(null);
                setAttendanceCount(0);
                setBaddies([]);
                setVoiceCommand(null);
                setVoiceProgress(0);
                setBattleStartsAtMs(null);
                setBattleEndsAtMs(null);
                setBattleTimeLeftMs(0);
                setBattleJoinedAtMs(null);
                setSummaryLoadAtMs(null);
                lastBattleSyncWindowKeyRef.current = null;
                resetBattleDamageTracking(confirmedUserDamageRef.current);
                const lastId = lastBattleIdRef.current;
                if (lastId && summaryRequestedRef.current !== lastId) {
                    summaryRequestedRef.current = lastId;
                    setSummaryVisible(true);
                    await loadBattleSummary(lastId);
                    return;
                }
                redirectToTree();
            }
        } catch (e) {
            console.error('Failed to fetch battle:', e);
        }
    }, [applyBattlePersonalState, applyServerNow, applyStoredBattleProgress, battleJoinedAtMs, joinBattle, loadBattleSummary, readBattleProgress, redirectToTree, resetBattleDamageTracking]);

    useEffect(() => {
        if (!isBrowserOnline || summaryVisible) return;
        void fetchBattle();
    }, [fetchBattle, isBrowserOnline, summaryVisible]);

    useEffect(() => {
        if (!isBattleActive || !battleId || summaryVisible) {
            hydratedBattleProgressKeyRef.current = null;
            return;
        }
        const key = getBattleProgressStorageKey(battleId);
        if (!key || hydratedBattleProgressKeyRef.current === key) {
            return;
        }
        hydratedBattleProgressKeyRef.current = key;
        const stored = readBattleProgress(battleId);
        if (!stored) {
            return;
        }
        applyStoredBattleProgress(stored);
    }, [applyStoredBattleProgress, battleId, getBattleProgressStorageKey, isBattleActive, readBattleProgress, summaryVisible]);

    useEffect(() => {
        if (!battleJoinedRef.current || !battleId || !isBattleActive) return;
        if (battleTimeLeftMs > 0 || summaryVisible) return;

        setIsBattleActive(false);
        setWeakZone(null);
        setSpark(null);
        setBaddies([]);
        setVoiceCommand(null);
        setVoiceProgress(0);
        setSummaryVisible(true);
        setSummaryLoadAtMs(computeBattleSummaryLoadAtMs());
        summaryRequestedRef.current = battleId;
        void loadBattleSummary(battleId, { silent: true });
    }, [battleId, battleTimeLeftMs, computeBattleSummaryLoadAtMs, isBattleActive, loadBattleSummary, summaryVisible]);

    useEffect(() => {
        if (summaryLoadTimerRef.current != null) {
            window.clearTimeout(summaryLoadTimerRef.current);
            summaryLoadTimerRef.current = null;
        }
        if (!battleId || summaryLoadAtMs == null || !summaryVisible) {
            return;
        }
        if (battleSummary) {
            return;
        }

        const delayMs = Math.max(100, summaryLoadAtMs - Date.now());
        summaryLoadTimerRef.current = window.setTimeout(() => {
            summaryLoadTimerRef.current = null;
            void loadBattleSummary(battleId, { silent: true });
        }, delayMs) as unknown as number;

        return () => {
            if (summaryLoadTimerRef.current != null) {
                window.clearTimeout(summaryLoadTimerRef.current);
                summaryLoadTimerRef.current = null;
            }
        };
    }, [battleId, battleSummary, loadBattleSummary, summaryLoadAtMs, summaryVisible]);

    useEffect(() => {
        if (battleSyncTimerRef.current != null) {
            window.clearTimeout(battleSyncTimerRef.current);
            battleSyncTimerRef.current = null;
        }
        if (!isBattleActive || !battleId || !isBrowserOnline || !battleJoinedRef.current || battleJoinedAtMs == null) {
            return;
        }

        let cancelled = false;
        const scheduleNextHeartbeat = () => {
            if (cancelled) return;
            if (!isBattleActive || !battleId || !isBrowserOnline || !battleJoinedRef.current || battleJoinedAtMs == null) {
                return;
            }
            const nowMs = Date.now() + serverOffsetMsRef.current;
            const joinedAtMs = battleJoinedAtMs;
            const intervalMs = Math.max(
                1000,
                Math.floor((Number(battleSyncIntervalSecondsRef.current) || BATTLE_REPORT_INTERVAL_SECONDS) * 1000),
            );
            const slotCount = Math.max(1, Math.floor(Number(battleSyncSlotCountRef.current) || 60));
            const slot = Math.max(0, Math.floor(Number(battleSyncSlotRef.current) || 0)) % slotCount;
            const baseAfterJoinMs = joinedAtMs + intervalMs;
            let targetMs = Math.max(nowMs, baseAfterJoinMs);
            if (slotCount > 1) {
                const slotWindowMs = Math.max(1, Math.floor(intervalMs / slotCount));
                const cycleStartMs = Math.floor(targetMs / intervalMs) * intervalMs;
                const slotTargetMs = cycleStartMs + (slot * slotWindowMs);
                targetMs = slotTargetMs >= targetMs ? slotTargetMs : slotTargetMs + intervalMs;
            }
            const delayMs = Math.max(100, targetMs - nowMs);
            battleSyncTimerRef.current = window.setTimeout(() => {
                battleSyncTimerRef.current = null;
                void sendHeartbeat().finally(() => {
                    scheduleNextHeartbeat();
                });
            }, delayMs) as unknown as number;
        };

        scheduleNextHeartbeat();
        return () => {
            cancelled = true;
            if (battleSyncTimerRef.current != null) {
                window.clearTimeout(battleSyncTimerRef.current);
                battleSyncTimerRef.current = null;
            }
        };
    }, [battleId, battleJoinedAtMs, isBattleActive, isBrowserOnline, sendHeartbeat]);

    useEffect(() => {
        if (finalReportTimerRef.current != null) {
            window.clearTimeout(finalReportTimerRef.current);
            finalReportTimerRef.current = null;
        }
        if (!summaryVisible || !battleId || !battleEndsAtMs || !battleJoinedRef.current) {
            return;
        }
        if (finalReportSentRef.current) return;

        const initialDelayMs = computeBattleFinalInitialDelayMs({
            battleId,
            userId: typeof user?.id === 'string' ? user.id : null,
            attendanceCount,
            capacity: battleFinalReportWindowCapacityRef.current,
            retryIntervalMs: battleFinalReportRetryIntervalMsRef.current,
        });

        finalReportTimerRef.current = window.setTimeout(() => {
            finalReportTimerRef.current = null;
            void sendFinalReport();
        }, Math.max(50, initialDelayMs));

        return () => {
            if (finalReportTimerRef.current != null) {
                window.clearTimeout(finalReportTimerRef.current);
                finalReportTimerRef.current = null;
            }
        };
    }, [attendanceCount, battleEndsAtMs, battleId, sendFinalReport, summaryVisible, user?.id]);

    useEffect(() => {
        if (!isBattleActive || !battleId || battleStartsAtMs == null || !battleScenario || battleJoinedAtMs == null || !battleJoinedRef.current) {
            if (lastVoiceCommandRef.current) {
                finalizeVoiceCommandResult(lastVoiceCommandRef.current);
                lastVoiceCommandRef.current = null;
            }
            setWeakZone(null);
            setVoiceCommand(null);
            setVoiceProgress(0);
            return;
        }

        const syncScenarioBattleState = () => {
            const elapsedMs = getBattleElapsedMs(battleStartsAtMs, serverOffsetMsRef.current);
            const activeWeak = battleScenario.weakZones.find((item) => elapsedMs >= item.startOffsetMs && elapsedMs < item.endOffsetMs) || null;
            const activeVoice = battleScenario.voiceCommands.find((item) => elapsedMs >= item.startOffsetMs && elapsedMs < item.endOffsetMs) || null;

            if (lastVoiceCommandRef.current && (!activeVoice || activeVoice.id !== lastVoiceCommandRef.current.id)) {
                finalizeVoiceCommandResult(lastVoiceCommandRef.current);
            }
            lastVoiceCommandRef.current = activeVoice;

            const nextWeakZone = activeWeak
                ? {
                    id: activeWeak.id,
                    active: true,
                    center: activeWeak.center,
                    radius: activeWeak.radius,
                }
                : null;
            const nextVoiceCommand = activeVoice
                ? {
                    id: activeVoice.id,
                    text: activeVoice.text,
                    endsAt: battleStartsAtMs + activeVoice.endOffsetMs,
                    requireShot: activeVoice.requireShot,
                    durationMs: activeVoice.durationMs,
                }
                : null;

            setWeakZone((prev) => (isSameWeakZoneState(prev, nextWeakZone) ? prev : nextWeakZone));
            setVoiceCommand((prev) => (isSameVoiceCommandState(prev, nextVoiceCommand) ? prev : nextVoiceCommand));
            if (!nextVoiceCommand) {
                setVoiceProgress(0);
            }
        };

        syncScenarioBattleState();
        const personalStateTickMs = isTabVisible
            ? (performanceTier === 'high' ? PERSONAL_STATE_VISIBLE_TICK_MS : 1500)
            : (performanceTier === 'high' ? PERSONAL_STATE_HIDDEN_TICK_MS : PERSONAL_STATE_HIDDEN_TICK_MS * 2);
        const interval = window.setInterval(syncScenarioBattleState, personalStateTickMs);
        return () => window.clearInterval(interval);
    }, [battleId, battleJoinedAtMs, battleScenario, battleStartsAtMs, finalizeVoiceCommandResult, isBattleActive, isTabVisible, performanceTier]);

    useEffect(() => {
        if (isBattleActive) {
            lastShotTelemetryRef.current = null;
        }
    }, [battleId, isBattleActive]);

    useEffect(() => {
        if (!summaryVisible) {
            summaryModalClicksRef.current = [];
            summaryBurstReportedRef.current = false;
        }
    }, [summaryVisible]);

    useEffect(() => {
        if (!isBattleActive || !battleEndsAtMs) {
            setBattleTimeLeftMs(0);
            return;
        }

        const tick = () => {
            const nowByServer = Date.now() + serverOffsetMsRef.current;
            setBattleTimeLeftMs(Math.max(0, battleEndsAtMs - nowByServer));
        };

        tick();
        const countdownTickMs = isTabVisible ? (performanceTier === 'high' ? 1000 : 1500) : 5000;
        const interval = window.setInterval(tick, countdownTickMs);
        return () => window.clearInterval(interval);
    }, [battleEndsAtMs, isBattleActive, isTabVisible, performanceTier]);

    const formatBattleTimeLeft = useCallback((ms: number) => {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, []);

    useEffect(() => {
        if (!isBattleActive) return;
        try {
            const key = `givkoin_battle_rules_shown_${user?._id || 'guest'}`;
            const shown = window.localStorage.getItem(key);
            if (shown) return;
            setRulesModalVisible(true);
        } catch {
        }
    }, [isBattleActive, user?._id]);

    const closeRulesModal = useCallback(() => {
        try {
            const key = `givkoin_battle_rules_shown_${user?._id || 'guest'}`;
            window.localStorage.setItem(key, '1');
        } catch {
        }
        setRulesModalVisible(false);
    }, [user?._id]);

    useEffect(() => {
        baddiesRef.current = baddies;
    }, [baddies]);

    const clearDomeBlink = useCallback(() => {
        if (domeBlinkTimeoutRef.current) {
            window.clearTimeout(domeBlinkTimeoutRef.current);
            domeBlinkTimeoutRef.current = null;
        }
        setDomeBlinkAt(0);
    }, []);

    const triggerDomeBlink = useCallback(() => {
        setDomeBlinkAt(Date.now());
        if (domeBlinkTimeoutRef.current) {
            window.clearTimeout(domeBlinkTimeoutRef.current);
        }
        domeBlinkTimeoutRef.current = window.setTimeout(() => {
            setDomeBlinkAt(0);
            domeBlinkTimeoutRef.current = null;
        }, 350);
    }, []);

    const checkHit = useCallback((worldX: number, worldY: number) => {
        return enemyLayerRef.current?.isPointInsideMask(worldX, worldY) ?? false;
    }, []);

    const isSilhouetteEvent = useCallback((event: EnemyHitEvent) => {
        return enemyLayerRef.current?.isPointInsideMask(event.worldPoint.x, event.worldPoint.y) ?? false;
    }, []);

    const handleShotAttempt = useCallback((weaponId: number, shotId: string, telemetry: ShotAttemptTelemetry) => {
        if (!battleId || !isBattleActive || battleTimeLeftMs <= 0) return false;

        const predictedChargeState = ensureShotChargeState(weaponId, shotId);
        if (predictedChargeState === 'unavailable') {
            return false;
        }

        const voiceTrapActive = Boolean(voiceCommand && !voiceCommand.requireShot);
        if (voiceTrapActive) {
            resetCombo();
        }
        const comboState = voiceTrapActive
            ? { count: 0, updatedAt: null as number | null }
            : bumpCombo();

        updateShotPreview(
            shotId,
            weaponId,
            predictedChargeState,
            telemetry.worldPoint,
            !voiceTrapActive,
        );

        reportAccRef.current.shotsByWeapon[weaponId] = (reportAccRef.current.shotsByWeapon[weaponId] || 0) + 1;
        const battleElapsedAtShotMs = battleStartsAtMs
            ? Math.max(0, Math.round((Date.now() + serverOffsetMsRef.current) - battleStartsAtMs))
            : 0;
        if (predictedChargeState === 'charged') {
            const spentNow = Math.max(0, Math.round(getEffectiveWeaponCost(weaponId)));
            reportAccRef.current.lumensSpent += spentNow;
            if (battleElapsedAtShotMs <= 120000) {
                if (weaponId === 3) {
                    reportAccRef.current.lumensSpentWeapon3First2Min += spentNow;
                } else {
                    reportAccRef.current.lumensSpentOtherFirst2Min += spentNow;
                }
            }
        }
        if (voiceCommand?.id) {
            actedVoiceIdsRef.current.add(voiceCommand.id);
        }

        const now = Date.now();
        lastShotTelemetryRef.current = {
            at: now,
            screenX: telemetry.screenX,
            screenY: telemetry.screenY,
        };
        persistBattleProgress({
            predictedLumens: predictedLumensRef.current,
            comboCount: comboState.count,
            comboSeriesDamage: comboSeriesDamageRef.current,
            comboUpdatedAt: comboState.updatedAt,
        });
        return true;
    }, [battleId, battleStartsAtMs, battleTimeLeftMs, bumpCombo, ensureShotChargeState, getEffectiveWeaponCost, isBattleActive, persistBattleProgress, resetCombo, updateShotPreview, voiceCommand]);

    const handleImpact = useCallback((payload: { worldPoint: { x: number; y: number; z: number }; weaponId: number; shotId: string }) => {
        const worldMin = Math.min(ENEMY_OUTLINE_WIDTH, ENEMY_OUTLINE_HEIGHT);
        const activeBaddies = baddiesRef.current.filter((baddie) => !baddie.exploding);
        let hitId: string | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        let bestRadius = 0;

        activeBaddies.forEach((baddie) => {
            if (baddie.exploding) return;
            const dx = payload.worldPoint.x - baddie.x;
            const dy = payload.worldPoint.y - baddie.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = Math.max(
                baddie.size * worldMin * (baddie.attached ? 1.7 : 1.15),
                worldMin * (baddie.attached ? 0.075 : 0.06),
            );
            if (dist < bestDist) {
                bestDist = dist;
                bestRadius = radius;
                hitId = baddie.id;
            }
        });

        const hitBaddie = hitId
            ? baddiesRef.current.find((baddie) => baddie.id === hitId && bestDist <= bestRadius)
            : null;

        if (hitBaddie && hitId) {
            if (!reportAccRef.current.baddieDestroyedIds.includes(hitId)) {
                reportAccRef.current.baddieDestroyedIds = [...reportAccRef.current.baddieDestroyedIds, hitId];
                persistBattleProgress();
            }
            setBaddies((prev) =>
                prev.map((item) => (item.id === hitId ? { ...item, exploding: true } : item)),
            );
            window.setTimeout(() => {
                setBaddies((prev) => prev.filter((item) => item.id !== hitId));
            }, 360);
            return { hit: true, type: 'baddie' as const };
        }

        return;
    }, [persistBattleProgress]);

    const handleHit = useCallback((event: EnemyHitEvent) => {
        if (!battleId || !isBattleActive || battleTimeLeftMs <= 0) {
            return;
        }

        if (!event.shotId) {
            return;
        }

        if (!isSilhouetteEvent(event)) {
            return;
        }

        const shotPreview = shotPreviewRef.current.get(event.shotId);
        const predictedDamage = getPredictedHitDamage(event);
        if (predictedDamage > 0) {
            addPendingUserDamage(predictedDamage);
            reportAccRef.current.hits += 1;
            reportAccRef.current.hitsByWeapon[Number(event.weaponId)] = (reportAccRef.current.hitsByWeapon[Number(event.weaponId)] || 0) + 1;
            reportAccRef.current.damageDelta += Math.max(0, Math.round(predictedDamage));
            if ((predictedLumensRef.current || 0) <= 0) {
                reportAccRef.current.damageAfterZeroLumens += Math.max(0, Math.round(predictedDamage));
            }
            if (shotPreview?.countsTowardCombo !== false) {
                comboSeriesDamageRef.current += Math.max(0, Math.round(predictedDamage));
            }

            const activeWeakZoneId = weakZone?.active ? weakZone.id : null;
            if (activeWeakZoneId) {
                reportAccRef.current.weakZoneHitsById[activeWeakZoneId] = (reportAccRef.current.weakZoneHitsById[activeWeakZoneId] || 0) + 1;
            }
            persistBattleProgress({ comboSeriesDamage: comboSeriesDamageRef.current });
        }

        const battleElapsedAtHitMs = battleStartsAtMs
            ? Math.max(0, Math.round((Date.now() + serverOffsetMsRef.current) - battleStartsAtMs))
            : 0;
        void shotPreview;
        void battleElapsedAtHitMs;
    }, [addPendingUserDamage, battleId, battleStartsAtMs, battleTimeLeftMs, getPredictedHitDamage, isBattleActive, isSilhouetteEvent, persistBattleProgress, weakZone]);

    const handleVisualHit = useCallback((event: EnemyHitEvent) => {
        if (!isBattleActive || battleTimeLeftMs <= 0) return;
        if (!isSilhouetteEvent(event)) return;
        enemyLayerRef.current?.registerHit({
            ...event,
            id: hitIdRef.current++,
        });
    }, [battleTimeLeftMs, isBattleActive, isSilhouetteEvent]);

    const handleSummaryModalPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!summaryVisible || !battleSummary?.battleId) return;

        const now = Date.now();
        const click = { at: now, x: event.clientX, y: event.clientY };
        const recent = [...summaryModalClicksRef.current, click].filter((item) => now - item.at <= 1500);
        summaryModalClicksRef.current = recent;

        const nearby = recent.filter((item) => Math.hypot(item.x - click.x, item.y - click.y) <= 12);
        if (summaryBurstReportedRef.current || nearby.length < 4) return;

        summaryBurstReportedRef.current = true;
        apiPost('/activity/behavior', {
            category: 'battle',
            eventType: 'battle_result_modal_same_spot_burst',
            battleId: battleSummary.battleId,
            scoreHint: 6,
            meta: {
                burstCount: nearby.length,
                x: Math.round(click.x),
                y: Math.round(click.y),
            },
        }).catch(() => { });
    }, [battleSummary?.battleId, summaryVisible]);

    useEffect(() => {
        if (!isBattleActive || !battleScenario || battleStartsAtMs == null || battleJoinedAtMs == null || !battleJoinedRef.current) return;

        const syncBaddieWaves = () => {
            const elapsedMs = getBattleElapsedMs(battleStartsAtMs, serverOffsetMsRef.current);
            const dueWaves = battleScenario.baddieWaves.filter(
                (wave) => elapsedMs >= wave.startOffsetMs && !processedBaddieWaveIdsRef.current.has(wave.id),
            );
            if (!dueWaves.length) return;

            const newBaddies = dueWaves.flatMap((wave) => {
                processedBaddieWaveIdsRef.current.add(wave.id);
                return wave.spheres
                    .filter((sphere) => !reportAccRef.current.baddieDestroyedIds.includes(sphere.id))
                    .map((sphere) => ({
                        id: sphere.id || `baddie_${Date.now()}_${baddieIdRef.current++}`,
                        x: sphere.x,
                        y: sphere.y,
                        size: sphere.size,
                        color: sphere.color,
                        shape: sphere.shape,
                        speed: sphere.speed,
                        attached: false,
                        lastDamageAt: 0,
                    }));
            });

            if (newBaddies.length) {
                setBaddies((prev) => [...prev, ...newBaddies]);
            }
        };

        syncBaddieWaves();
        const interval = window.setInterval(syncBaddieWaves, 250);
        return () => window.clearInterval(interval);
    }, [battleJoinedAtMs, battleScenario, battleStartsAtMs, isBattleActive]);

    useEffect(() => {
        if (!isBattleActive) return;
        const tickMs = performanceTier === 'medium' ? 110 : 70;
        let lastTime = performance.now();
        const baddieDamageIntervalMs = Math.max(1, battleScenario?.baddieDamageIntervalMs || BADDIE_DAMAGE_INTERVAL);
        const baddieDamagePerTick = Math.max(0, battleScenario?.baddieDamagePerTick || 1);

        const tick = () => {
            const now = performance.now();
            const delta = now - lastTime;
            lastTime = now;

            setBaddies((prev) => {
                if (!prev.length) return prev;
                let damageTicks = 0;
                const next = prev.map((baddie) => {
                    if (baddie.exploding) return baddie;
                    if (baddie.attached) {
                        if (now - baddie.lastDamageAt >= baddieDamageIntervalMs) {
                            damageTicks += baddieDamagePerTick;
                            return { ...baddie, lastDamageAt: now };
                        }
                        return baddie;
                    }

                    const worldMin = Math.min(ENEMY_OUTLINE_WIDTH, ENEMY_OUTLINE_HEIGHT);
                    const centerWorld = {
                        x: ENEMY_OUTLINE.minX + domeCenter.x * ENEMY_OUTLINE_WIDTH,
                        y: ENEMY_OUTLINE.maxY - domeCenter.y * ENEMY_OUTLINE_HEIGHT,
                    };
                    const domeRadiusWorld = domeRadius * domeVisualScale * worldMin;
                    const dx = centerWorld.x - baddie.x;
                    const dy = centerWorld.y - baddie.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= domeRadiusWorld) {
                        const safeDist = dist || 1;
                        const baddieRadiusWorld = Math.max(baddie.size * worldMin * 0.58, worldMin * 0.03);
                        const attachOrbitRadius = domeRadiusWorld + baddieRadiusWorld;
                        const attachX = centerWorld.x - (dx / safeDist) * attachOrbitRadius;
                        const attachY = centerWorld.y - (dy / safeDist) * attachOrbitRadius;
                        damageTicks += baddieDamagePerTick;
                        return {
                            ...baddie,
                            x: Math.min(ENEMY_OUTLINE.maxX, Math.max(ENEMY_OUTLINE.minX, attachX)),
                            y: Math.min(ENEMY_OUTLINE.maxY, Math.max(ENEMY_OUTLINE.minY, attachY)),
                            attached: true,
                            lastDamageAt: now,
                        };
                    }
                    const step = baddie.speed * delta;
                    const nx = baddie.x + (dx / (dist || 1)) * step;
                    const ny = baddie.y + (dy / (dist || 1)) * step;
                    return { ...baddie, x: nx, y: ny };
                });

                if (damageTicks > 0) {
                    reportAccRef.current.baddieDamage += damageTicks;
                    persistBattleProgress();
                    triggerDomeBlink();
                }

                return next;
            });
        };

        tick();
        const interval = window.setInterval(tick, tickMs);
        return () => window.clearInterval(interval);
    }, [battleScenario?.baddieDamageIntervalMs, battleScenario?.baddieDamagePerTick, domeCenter.x, domeCenter.y, domeRadius, domeVisualScale, isBattleActive, performanceTier, persistBattleProgress, triggerDomeBlink]);

    useEffect(() => {
        if (!isBattleActive || !battleScenario || battleStartsAtMs == null || battleJoinedAtMs == null || !battleJoinedRef.current) return;

        const syncSparkFromScenario = () => {
            const elapsedMs = getBattleElapsedMs(battleStartsAtMs, serverOffsetMsRef.current);
            setSpark((prev) => {
                if (prev) return prev;
                const nextSpark = battleScenario.sparks.find((item) =>
                    elapsedMs >= item.startOffsetMs
                    && elapsedMs <= item.startOffsetMs + 20000
                    && !processedSparkIdsRef.current.has(item.id),
                );
                if (!nextSpark) return prev;
                return {
                    id: nextSpark.id,
                    x: nextSpark.x,
                    y: nextSpark.y,
                    vx: nextSpark.vx,
                    vy: nextSpark.vy,
                };
            });
        };

        syncSparkFromScenario();
        const interval = window.setInterval(syncSparkFromScenario, 250);
        return () => window.clearInterval(interval);
    }, [battleJoinedAtMs, battleScenario, battleStartsAtMs, isBattleActive]);

    useEffect(() => {
        if (!voiceCommand) return;
        const tick = () => {
            const nowByServer = Date.now() + serverOffsetMsRef.current;
            const left = Math.max(0, voiceCommand.endsAt - nowByServer);
            const p = 1 - left / voiceCommand.durationMs;
            setVoiceProgress(Math.max(0, Math.min(1, p)));
            if (left <= 0) {
                setVoiceCommand(null);
            }
        };

        tick();
        const voiceTickMs = isTabVisible ? (performanceTier === 'high' ? 120 : 200) : 500;
        const interval = window.setInterval(tick, voiceTickMs);
        return () => window.clearInterval(interval);
    }, [isTabVisible, performanceTier, voiceCommand]);

    useEffect(() => {
        if (!isBattleActive) resetCombo();
    }, [isBattleActive, resetCombo]);

    useEffect(() => {
        return () => {
            if (battleJoinRetryTimerRef.current != null) {
                window.clearTimeout(battleJoinRetryTimerRef.current);
                battleJoinRetryTimerRef.current = null;
            }
            if (comboResetTimeoutRef.current) {
                window.clearTimeout(comboResetTimeoutRef.current);
            }
            if (battleSyncTimerRef.current) {
                window.clearTimeout(battleSyncTimerRef.current);
                battleSyncTimerRef.current = null;
            }
            setBattleJoinedAtMs(null);
            setSummaryLoadAtMs(null);
            if (summaryLoadTimerRef.current != null) {
                window.clearTimeout(summaryLoadTimerRef.current);
                summaryLoadTimerRef.current = null;
            }
            if (domeBlinkTimeoutRef.current) {
                window.clearTimeout(domeBlinkTimeoutRef.current);
                domeBlinkTimeoutRef.current = null;
            }
            if (damageHudTimerRef.current != null) {
                window.clearTimeout(damageHudTimerRef.current);
                damageHudTimerRef.current = null;
            }
            if (lumensHudTimerRef.current != null) {
                window.clearTimeout(lumensHudTimerRef.current);
                lumensHudTimerRef.current = null;
            }
            clearInFlightDamageBatches();
            clearDomeBlink();
        };
    }, [clearDomeBlink, clearInFlightDamageBatches]);

    useEffect(() => {
        if (!spark || !isTabVisible) return;
        const sparkTickMs = performanceTier === 'high' ? 60 : performanceTier === 'medium' ? 90 : 120;
        const interval = window.setInterval(() => {
            setSpark((prev) => {
                if (!prev) return null;
                const nx = prev.x + prev.vx;
                const ny = prev.y + prev.vy;
                if (nx < -0.2 || nx > 1.2 || ny < -0.2 || ny > 1.2) {
                    processedSparkIdsRef.current.add(prev.id);
                    return null;
                }
                return { ...prev, x: nx, y: ny };
            });
        }, sparkTickMs);
        return () => window.clearInterval(interval);
    }, [isTabVisible, performanceTier, spark]);

    const comboMultiplier = useMemo(() => getComboMultiplier(comboCount), [comboCount]);
    const treeScale = useMemo<[number, number, number]>(
        () => (performanceTier === 'low' ? [0.58, 0.58, 0.58] : [0.66, 0.66, 0.66]),
        [performanceTier]
    );
    const treePosition = useMemo<[number, number, number]>(
        () => (performanceTier === 'low' ? [0, -139.5, -100] : [0, -132.3, -100]),
        [performanceTier]
    );
    const domeState = useMemo(
        () => ({ center: domeCenter, radius: domeRadius, visualScale: domeVisualScale, blinkAt: domeBlinkAt }),
        [domeBlinkAt, domeCenter, domeRadius, domeVisualScale],
    );
    const showActiveBattleScene = isBattleActive && !summaryVisible;
    const showSummaryBackdrop = summaryVisible && !isBattleActive;

    return (
        <div className="relative w-full h-[100dvh] min-h-[100dvh] bg-black overflow-hidden overscroll-none z-[9999] lg:fixed lg:inset-0">
            {showActiveBattleScene ? (
                <>
                    <div
                        className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
                    >
                        <div className="px-3 md:px-4 py-1.5 md:py-2 rounded-2xl bg-black/70 border border-white/10 text-white text-sm md:text-base font-bold tracking-wider backdrop-blur-md">
                            {formatBattleTimeLeft(battleTimeLeftMs)}
                        </div>
                    </div>

                    {/* Background Layer: Enemy & Videos */}
                    <EnemyLayer
                        ref={enemyLayerRef}
                        className="z-0"
                        backgroundSrc="/relax.mp4"
                        reactionSrc="/atack.mp4"
                        silhouetteSrc="/gorilla_silhouette.svg"
                        performanceTier={performanceTier}
                        weakZone={weakZone}
                    />

                    {/* Middle Layer: Tree (Optional, but looks cool) */}
                    <TreeLayer
                        className="z-10 pointer-events-none"
                        scale={treeScale}
                        position={treePosition}
                        rotate={false}
                    />

                    <BaddieLayer
                        baddies={baddies}
                        dome={domeState}
                        coords="world"
                    />

                    {/* Top Layer: Cockpit & Weapons */}
                    <div className="absolute inset-0 z-20 pointer-events-auto">
                        <GameScene
                            onHit={handleHit}
                            onVisualHit={handleVisualHit}
                            checkHit={checkHit}
                            onImpact={handleImpact}
                            backgroundColor="transparent"
                            showCrosshair={true}
                            onShotAttempt={handleShotAttempt}
                            weaponAvailability={weaponAvailability}
                            performanceTier={performanceTier}
                        />
                    </div>
                </>
            ) : showSummaryBackdrop ? (
                <div className="absolute inset-0 overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: 'url("/8k_stars_milky_way.jpg")' }}
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_32%),radial-gradient(circle_at_bottom,rgba(6,182,212,0.14),transparent_36%),linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.78))]" />
                </div>
            ) : (
                <div className="absolute inset-0 bg-black" />
            )}

            {showActiveBattleScene && spark && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    onClick={async () => {
                        if (sparkCollectingRef.current) return;
                        if (!isBattleActive || battleTimeLeftMs <= 0) return;
                        sparkCollectingRef.current = true;
                        setSpark(null);
                        try {
                            const gained = Math.max(0, Math.floor(sparkRewardLumens) || 0);
                            processedSparkIdsRef.current.add(spark.id);
                            if (!reportAccRef.current.sparkIds.includes(spark.id)) {
                                reportAccRef.current.sparkIds = [...reportAccRef.current.sparkIds, spark.id];
                            }

                            reportAccRef.current.crystalsCollected += 1;
                            reportAccRef.current.lumensGained += gained;

                            if (gained > 0) {
                                predictedLumensRef.current = Math.max(0, Number(predictedLumensRef.current) || 0) + gained;
                                syncDisplayedLumens();
                                if (user) {
                                    updateUser({
                                        ...user,
                                        lumens: Math.max(0, Number(user.lumens) || 0) + gained,
                                    });
                                }
                            }
                            persistBattleProgress({ predictedLumens: predictedLumensRef.current });
                        } finally {
                            sparkCollectingRef.current = false;
                        }
                    }}
                    className="absolute z-40 pointer-events-auto"
                    style={{
                        left: `${Math.round(spark.x * 1000) / 10}%`,
                        top: `${Math.round(spark.y * 1000) / 10}%`,
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    <div className="rounded-full border border-amber-300/50 bg-amber-400/20 p-3 shadow-[0_0_22px_rgba(251,191,36,0.35)] backdrop-blur-sm">
                        <Sparkles className="h-6 w-6 text-amber-200" />
                    </div>
                </motion.div>
            )}

            {showActiveBattleScene && voiceCommand && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-48 md:bottom-36 z-50 pointer-events-none px-2">
                    <div className="px-4 md:px-6 py-2.5 md:py-3 rounded-2xl bg-black/70 border border-red-500/30 text-center backdrop-blur-md">
                        <div className="text-white font-black uppercase tracking-widest text-xs md:text-h3">
                            {t('battle.darkness_speaks')}: {voiceCommand.text === 'СТОЙ' ? t('battle.stop') : t('battle.shoot')}!
                        </div>
                        <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: `${voiceProgress * 100}%` }} />
                        </div>
                    </div>
                </div>
            )}

            {showActiveBattleScene && connectionLost && (
                <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-50 pointer-events-auto px-4">
                    <div className="px-6 py-4 rounded-2xl bg-red-900/80 border border-red-500/50 text-center backdrop-blur-md shadow-[0_0_30px_rgba(239,68,68,0.4)]">
                        <div className="text-red-200 font-bold text-sm md:text-base mb-2">
                            ⚠️ {t('battle.connection_lost_title')}
                        </div>
                        <div className="text-red-300/80 text-xs md:text-sm mb-3">
                            {t('battle.connection_lost_desc')}
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 rounded-lg bg-red-600/50 hover:bg-red-500/60 text-white text-xs font-bold uppercase tracking-wide transition-colors"
                        >
                            {t('battle.refresh_page')}
                        </button>
                    </div>
                </div>
            )}

            {/* UI Overlay: Back Button */}
            {showActiveBattleScene && (
                <motion.button
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => window.location.href = localePath('/tree')}
                    className="absolute top-3 md:top-6 left-3 md:left-6 z-50 px-3 md:px-5 py-1.5 md:py-2 rounded-full border border-red-400/40 bg-gradient-to-r from-red-900/50 via-red-700/30 to-amber-500/10 text-red-100 text-caption md:text-label font-black uppercase tracking-[0.18em] md:tracking-[0.28em] shadow-[0_0_24px_rgba(248,113,113,0.35)] backdrop-blur-md transition-all hover:border-red-300/70 hover:bg-red-600/30 hover:text-red-50"
                    style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.8rem)' }}
                >
                    <span className="inline-block italic skew-x-6">{t('battle.to_tree')}</span>
                </motion.button>
            )}

            {/* HUD Info: Damage Counter & Resources */}
            {showActiveBattleScene && (
                <div
                    className="absolute right-3 md:right-6 z-50 flex flex-col items-end gap-1.5 md:gap-2 pointer-events-none"
                    style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.8rem)' }}
                >
                    <div className="px-3 md:px-4 py-1 bg-cyan-500/20 border border-cyan-500/50 text-cyan-200 text-caption md:text-tiny font-bold rounded uppercase tracking-widest backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                        {t('battle.your_damage_hud')} <span className="tabular-nums">{userDamage.toLocaleString()}</span>
                    </div>
                    <div className="px-3 md:px-4 py-1 bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 text-caption md:text-tiny font-bold rounded uppercase tracking-widest backdrop-blur-md">
                        {t('battle.participants_hud')} <span className="tabular-nums">{attendanceCount.toLocaleString()}</span>
                    </div>
                    <div className="px-2.5 md:px-3 py-1 bg-blue-500/20 border border-blue-500/50 text-blue-200 text-caption md:text-tiny font-bold rounded uppercase tracking-widest backdrop-blur-md">
                        {t('battle.lumens_hud')} {displayedLumens.toLocaleString()}
                    </div>
                    {comboMultiplier > 1 && (
                        <div className="self-end">
                            <div className="px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-400/45 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.25)] backdrop-blur-md">
                                <div className="flex items-center gap-2">
                                    <span className="text-caption font-black uppercase tracking-[0.28em] text-amber-200/80">
                                        {t('battle.combo_hud')}
                                    </span>
                                    <span className="text-base font-black tabular-nums leading-none">
                                        {comboCount}
                                    </span>
                                    <span className="text-caption font-black tracking-widest text-amber-200 leading-none">
                                        x{comboMultiplier % 1 === 0 ? comboMultiplier.toFixed(0) : comboMultiplier.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <AnimatePresence>
                {showActiveBattleScene && rulesModalVisible && (
                    <motion.div
                        className="fixed inset-0 z-[130] flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeRulesModal} />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="relative z-10 w-full max-w-xl rounded-2xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl backdrop-blur-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-h3 text-white font-black uppercase tracking-widest">{t('battle.rules_modal_title')}</div>
                            <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-4 text-secondary text-white/75 whitespace-pre-wrap custom-scrollbar">
                                <div className="space-y-3 text-secondary text-white/75">
                                    <p>
                                        {t('battle.rules_modal_p1')}
                                    </p>
                                    <p>
                                        {t('battle.rules_modal_p2')}
                                    </p>
                                    <p>
                                        {t('battle.rules_modal_p3')}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
                                <Link
                                    href={localePath('/rules')}
                                    onClick={closeRulesModal}
                                    className="text-center rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-secondary font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    {t('battle.open_rules')}
                                </Link>
                                <button
                                    type="button"
                                    onClick={closeRulesModal}
                                    className="rounded-xl bg-primary-light px-5 py-2 text-secondary font-semibold text-primary-dark transition-transform hover:scale-[1.02]"
                                >
                                    {t('common.ok')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div onPointerDownCapture={handleSummaryModalPointer}>
                <BattleSummaryOverlay
                    isOpen={summaryVisible}
                    summary={battleSummary}
                    loading={summaryLoading}
                    onClose={redirectToTree}
                    onPrimaryAction={redirectToTree}
                    primaryActionLabel={t('battle.back_to_tree')}
                    onSecondaryAction={battleSummary?.injury && battleSummary.result === 'dark'
                        ? redirectToTree
                        : null}
                    secondaryActionLabel={battleSummary?.injury && battleSummary.result === 'dark'
                        ? t('battle.heal_branch')
                        : null}
                />
            </div>
        </div>
    );
}

