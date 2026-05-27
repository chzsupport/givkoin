import type { Baddie } from './BaddieLayer';
import type { VOICE_COMMAND_SHOOT, VOICE_COMMAND_STOP } from './battleConstants';

export type BattleVoiceCommandText = typeof VOICE_COMMAND_SHOOT | typeof VOICE_COMMAND_STOP;

export type BattleInjury = {
    branchName: string;
    debuffPercent: number;
};

export type BattleScenarioWeakZone = {
    id: string;
    startOffsetMs: number;
    endOffsetMs: number;
    radius: number;
    center: { x: number; y: number; z: number };
};

export type BattleScenarioVoiceCommand = {
    id: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    text: BattleVoiceCommandText;
    requireShot: boolean;
};

export type BattleScenarioSpark = {
    id: string;
    startOffsetMs: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rewardLumens: number;
};

export type BattleScenarioBaddieWave = {
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

export type BattleScenario = {
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

export type BattleBaddieState = Baddie & {
    speed: number;
    attached: boolean;
    attachedAngle: number | null;
    lastDamageAt: number;
};

export type BattleActiveVoiceCommand = {
    id: string;
    text: BattleVoiceCommandText;
    endsAt: number;
    requireShot: boolean;
    durationMs: number;
};

export type BattleVoiceResult = {
    id: string;
    text: BattleVoiceCommandText;
    acted: boolean;
    success: boolean;
};

export type BattleWeakZone = {
    id: string | null;
    active: boolean;
    center: { x: number; y: number; z: number } | null;
    radius: number;
};

export type BattleWorldPoint = { x: number; y: number; z: number };

export type BattleSparkState = {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
};

export type ShotChargeState = 'charged' | 'penalty' | 'unavailable';

export type ShotPreview = {
    at: number;
    weaponId: number;
    chargeState: ShotChargeState;
    aimWorldPoint: BattleWorldPoint | null;
    countsTowardCombo: boolean;
};

export type PendingBattleReportChunk = {
    sequence: number;
    report: BattleMinuteReportAccumulator;
};

export type BattlePersonalState = {
    joinedAt: string | null;
    confirmedDamage: number;
    confirmedLumens: number | null;
    startLumens: number | null;
    startK: number | null;
    startStars: number | null;
    lastAcceptedReportSequence: number;
    lastClientSyncAt: string | null;
};

export type StoredBattleProgress = {
    version: number;
    battleId: string;
    userId: string;
    savedAt: number;
    joinedAtIso: string | null;
    battleJoinedAtMs: number | null;
    startLumens: number | null;
    startK: number | null;
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

export type BattleProgressPersistOverrides = Partial<Omit<StoredBattleProgress, 'version' | 'battleId' | 'userId' | 'savedAt'>>;

export type InFlightDamageBatch = {
    id: string;
    remainingPredictedDamage: number;
    timeoutId: number | null;
};

export type BattleBoostState = {
    pending?: boolean;
    battleId?: string;
    activatedAt?: string;
};

export type BattleMinuteReportAccumulator = {
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
