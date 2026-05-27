import { useCallback, type MutableRefObject } from 'react';
import type { ShotAttemptTelemetry } from './GameScene';
import type {
    BattleActiveVoiceCommand,
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
    BattleWorldPoint,
    ShotChargeState,
} from './battleTypes';

type BumpCombo = () => { count: number; updatedAt: number };
type EnsureShotChargeState = (weaponIdToUse: number, shotIdToUse: string) => ShotChargeState;
type GetEffectiveWeaponCost = (weaponIdToUse: number) => number;
type PersistBattleProgress = (overrides?: BattleProgressPersistOverrides) => void;
type ResetCombo = () => void;
type UpdateShotPreview = (
    shotIdToUse: string,
    weaponIdToUse: number,
    chargeState: ShotChargeState,
    aimWorldPoint?: BattleWorldPoint | null,
    countsTowardCombo?: boolean,
) => void;

export function useBattleShotAttempt({
    actedVoiceIdsRef,
    battleId,
    battleStartsAtMs,
    battleTimeLeftMs,
    bumpCombo,
    comboSeriesDamageRef,
    ensureShotChargeState,
    getEffectiveWeaponCost,
    isBattleActive,
    lastShotTelemetryRef,
    persistBattleProgress,
    predictedLumensRef,
    reportAccRef,
    resetCombo,
    serverOffsetMsRef,
    updateShotPreview,
    voiceCommand,
}: {
    actedVoiceIdsRef: MutableRefObject<Set<string>>;
    battleId: string | null;
    battleStartsAtMs: number | null;
    battleTimeLeftMs: number;
    bumpCombo: BumpCombo;
    comboSeriesDamageRef: MutableRefObject<number>;
    ensureShotChargeState: EnsureShotChargeState;
    getEffectiveWeaponCost: GetEffectiveWeaponCost;
    isBattleActive: boolean;
    lastShotTelemetryRef: MutableRefObject<{ at: number; screenX: number; screenY: number } | null>;
    persistBattleProgress: PersistBattleProgress;
    predictedLumensRef: MutableRefObject<number>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    resetCombo: ResetCombo;
    serverOffsetMsRef: MutableRefObject<number>;
    updateShotPreview: UpdateShotPreview;
    voiceCommand: BattleActiveVoiceCommand | null;
}) {
    return useCallback((weaponId: number, shotId: string, telemetry: ShotAttemptTelemetry) => {
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
    }, [
        actedVoiceIdsRef,
        battleId,
        battleStartsAtMs,
        battleTimeLeftMs,
        bumpCombo,
        comboSeriesDamageRef,
        ensureShotChargeState,
        getEffectiveWeaponCost,
        isBattleActive,
        lastShotTelemetryRef,
        persistBattleProgress,
        predictedLumensRef,
        reportAccRef,
        resetCombo,
        serverOffsetMsRef,
        updateShotPreview,
        voiceCommand,
    ]);
}
