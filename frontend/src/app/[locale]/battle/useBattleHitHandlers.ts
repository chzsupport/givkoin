import { useCallback, type MutableRefObject } from 'react';
import type { EnemyLayerHandle } from './EnemyLayer';
import type { EnemyHitEvent } from './enemyZones';
import type {
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
    BattleWeakZone,
    ShotPreview,
} from './battleTypes';

type AddPendingUserDamage = (damageDelta: number) => void;
type ConsumeAccountedHitKey = (event: EnemyHitEvent) => boolean;
type GetPredictedHitDamage = (event: EnemyHitEvent) => number;
type PersistBattleProgress = (overrides?: BattleProgressPersistOverrides) => void;

export function useBattleHitHandlers({
    addPendingUserDamage,
    battleId,
    battleStartsAtMs,
    battleTimeLeftMs,
    comboSeriesDamageRef,
    consumeAccountedHitKey,
    enemyLayerRef,
    getPredictedHitDamage,
    hitIdRef,
    isBattleActive,
    persistBattleProgress,
    predictedLumensRef,
    reportAccRef,
    serverOffsetMsRef,
    shotPreviewRef,
    weakZone,
}: {
    addPendingUserDamage: AddPendingUserDamage;
    battleId: string | null;
    battleStartsAtMs: number | null;
    battleTimeLeftMs: number;
    comboSeriesDamageRef: MutableRefObject<number>;
    consumeAccountedHitKey: ConsumeAccountedHitKey;
    enemyLayerRef: MutableRefObject<EnemyLayerHandle | null>;
    getPredictedHitDamage: GetPredictedHitDamage;
    hitIdRef: MutableRefObject<number>;
    isBattleActive: boolean;
    persistBattleProgress: PersistBattleProgress;
    predictedLumensRef: MutableRefObject<number>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    serverOffsetMsRef: MutableRefObject<number>;
    shotPreviewRef: MutableRefObject<Map<string, ShotPreview>>;
    weakZone: BattleWeakZone | null;
}) {
    const handleHit = useCallback((event: EnemyHitEvent) => {
        if (!battleId || !isBattleActive || battleTimeLeftMs <= 0) {
            return;
        }

        if (!event.shotId) {
            return;
        }

        if (!consumeAccountedHitKey(event)) {
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
    }, [
        addPendingUserDamage,
        battleId,
        battleStartsAtMs,
        battleTimeLeftMs,
        comboSeriesDamageRef,
        consumeAccountedHitKey,
        getPredictedHitDamage,
        isBattleActive,
        persistBattleProgress,
        predictedLumensRef,
        reportAccRef,
        serverOffsetMsRef,
        shotPreviewRef,
        weakZone,
    ]);

    const handleVisualHit = useCallback((event: EnemyHitEvent) => {
        if (!isBattleActive || battleTimeLeftMs <= 0) return;
        enemyLayerRef.current?.registerHit({
            ...event,
            id: hitIdRef.current++,
        });
    }, [battleTimeLeftMs, enemyLayerRef, hitIdRef, isBattleActive]);

    return {
        handleHit,
        handleVisualHit,
    };
}
