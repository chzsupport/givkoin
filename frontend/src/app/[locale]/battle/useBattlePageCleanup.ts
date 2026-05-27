import {
    useEffect,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';

type TimerRef = MutableRefObject<number | null>;

const clearTimerRef = (timerRef: TimerRef) => {
    if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
    }
};

export function useBattlePageCleanup({
    battleJoinRetryTimerRef,
    comboResetTimeoutRef,
    battleSyncTimerRef,
    summaryLoadTimerRef,
    damageHudTimerRef,
    lumensHudTimerRef,
    setBattleJoinedAtMs,
    setSummaryLoadAtMs,
    clearInFlightDamageBatches,
    clearDomeBlink,
}: {
    battleJoinRetryTimerRef: TimerRef;
    comboResetTimeoutRef: TimerRef;
    battleSyncTimerRef: TimerRef;
    summaryLoadTimerRef: TimerRef;
    damageHudTimerRef: TimerRef;
    lumensHudTimerRef: TimerRef;
    setBattleJoinedAtMs: Dispatch<SetStateAction<number | null>>;
    setSummaryLoadAtMs: Dispatch<SetStateAction<number | null>>;
    clearInFlightDamageBatches: () => void;
    clearDomeBlink: () => void;
}) {
    useEffect(() => {
        return () => {
            clearTimerRef(battleJoinRetryTimerRef);
            clearTimerRef(comboResetTimeoutRef);
            clearTimerRef(battleSyncTimerRef);
            setBattleJoinedAtMs(null);
            setSummaryLoadAtMs(null);
            clearTimerRef(summaryLoadTimerRef);
            clearTimerRef(damageHudTimerRef);
            clearTimerRef(lumensHudTimerRef);
            clearInFlightDamageBatches();
            clearDomeBlink();
        };
    }, [
        battleJoinRetryTimerRef,
        battleSyncTimerRef,
        clearDomeBlink,
        clearInFlightDamageBatches,
        comboResetTimeoutRef,
        damageHudTimerRef,
        lumensHudTimerRef,
        setBattleJoinedAtMs,
        setSummaryLoadAtMs,
        summaryLoadTimerRef,
    ]);
}
