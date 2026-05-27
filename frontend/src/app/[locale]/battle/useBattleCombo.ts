import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { COMBO_RESET_MS } from './battleConstants';
import { getComboMultiplier } from './battleClientState';
import type {
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
} from './battleTypes';

type AddPendingUserDamage = (damageDelta: number) => void;
type PersistBattleProgress = (overrides?: BattleProgressPersistOverrides) => void;

export function useBattleCombo({
    addPendingUserDamage,
    battleStartsAtMs,
    comboCountRef,
    comboResetTimeoutRef,
    comboSeriesDamageRef,
    comboUpdatedAtRef,
    comboX2MaxDurationRef,
    comboX2StartedAtRef,
    pendingUserDamageRef,
    persistBattleProgress,
    phoenixStageRef,
    reportAccRef,
    serverOffsetMsRef,
    setComboCount,
}: {
    addPendingUserDamage: AddPendingUserDamage;
    battleStartsAtMs: number | null;
    comboCountRef: MutableRefObject<number>;
    comboResetTimeoutRef: MutableRefObject<number | null>;
    comboSeriesDamageRef: MutableRefObject<number>;
    comboUpdatedAtRef: MutableRefObject<number | null>;
    comboX2MaxDurationRef: MutableRefObject<number>;
    comboX2StartedAtRef: MutableRefObject<number | null>;
    pendingUserDamageRef: MutableRefObject<number>;
    persistBattleProgress: PersistBattleProgress;
    phoenixStageRef: MutableRefObject<number>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    serverOffsetMsRef: MutableRefObject<number>;
    setComboCount: Dispatch<SetStateAction<number>>;
}) {
    const recordComboHoldDuration = useCallback(() => {
        if (comboX2StartedAtRef.current != null && comboUpdatedAtRef.current != null) {
            const heldSeconds = Math.max(0, Math.floor((comboUpdatedAtRef.current - comboX2StartedAtRef.current) / 1000));
            comboX2MaxDurationRef.current = Math.max(comboX2MaxDurationRef.current, heldSeconds);
            reportAccRef.current.heldComboX2MaxDuration = Math.max(reportAccRef.current.heldComboX2MaxDuration, comboX2MaxDurationRef.current);
            comboX2StartedAtRef.current = null;
        }
    }, [comboUpdatedAtRef, comboX2MaxDurationRef, comboX2StartedAtRef, reportAccRef]);

    const clearComboValues = useCallback(() => {
        if (comboResetTimeoutRef.current != null) {
            window.clearTimeout(comboResetTimeoutRef.current);
            comboResetTimeoutRef.current = null;
        }
        comboCountRef.current = 0;
        comboSeriesDamageRef.current = 0;
        comboUpdatedAtRef.current = null;
        setComboCount(0);
        persistBattleProgress({ comboCount: 0, comboSeriesDamage: 0, comboUpdatedAt: null });
    }, [comboCountRef, comboResetTimeoutRef, comboSeriesDamageRef, comboUpdatedAtRef, persistBattleProgress, setComboCount]);

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
        recordComboHoldDuration();
        if (phoenixStageRef.current === 1) {
            phoenixStageRef.current = 2;
            reportAccRef.current.phoenixStage = Math.max(reportAccRef.current.phoenixStage, phoenixStageRef.current);
        }
        comboCountRef.current = 0;
        comboSeriesDamageRef.current = 0;
        comboUpdatedAtRef.current = null;
        setComboCount(0);
        persistBattleProgress({ comboCount: 0, comboSeriesDamage: 0, comboUpdatedAt: null });
    }, [
        addPendingUserDamage,
        comboCountRef,
        comboResetTimeoutRef,
        comboSeriesDamageRef,
        comboUpdatedAtRef,
        persistBattleProgress,
        phoenixStageRef,
        recordComboHoldDuration,
        reportAccRef,
        setComboCount,
    ]);

    const scheduleComboReset = useCallback(() => {
        if (comboResetTimeoutRef.current) {
            window.clearTimeout(comboResetTimeoutRef.current);
        }
        comboResetTimeoutRef.current = window.setTimeout(() => {
            resetCombo();
        }, COMBO_RESET_MS);
    }, [comboResetTimeoutRef, resetCombo]);

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
    }, [
        battleStartsAtMs,
        comboCountRef,
        comboUpdatedAtRef,
        comboX2StartedAtRef,
        phoenixStageRef,
        reportAccRef,
        scheduleComboReset,
        serverOffsetMsRef,
        setComboCount,
    ]);

    const finalizeComboForReport = useCallback(() => {
        const comboMultiplier = getComboMultiplier(comboCountRef.current);
        const comboSeriesDamage = Math.max(0, Math.round(comboSeriesDamageRef.current));
        if (comboMultiplier > 1 && comboSeriesDamage > 0) {
            const comboBonusDamage = Math.max(0, Math.round(comboSeriesDamage * (comboMultiplier - 1)));
            if (comboBonusDamage > 0) {
                pendingUserDamageRef.current += comboBonusDamage;
                reportAccRef.current.damageDelta += comboBonusDamage;
            }
        }
        recordComboHoldDuration();
        if (comboCountRef.current > 0 || comboSeriesDamageRef.current > 0) {
            clearComboValues();
        }
    }, [
        clearComboValues,
        comboCountRef,
        comboSeriesDamageRef,
        pendingUserDamageRef,
        recordComboHoldDuration,
        reportAccRef,
    ]);

    return {
        bumpCombo,
        finalizeComboForReport,
        resetCombo,
    };
}
