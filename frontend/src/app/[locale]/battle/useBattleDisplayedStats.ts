import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';

export type BattleDisplaySyncMode = 'throttled' | 'immediate';

export function useBattleDisplayedStats({
    damageHudTimerRef,
    getDisplayedUserDamageValue,
    lumensHudTimerRef,
    predictedLumensRef,
    setDisplayedLumens,
    setUserDamage,
}: {
    damageHudTimerRef: MutableRefObject<number | null>;
    getDisplayedUserDamageValue: () => number;
    lumensHudTimerRef: MutableRefObject<number | null>;
    predictedLumensRef: MutableRefObject<number>;
    setDisplayedLumens: Dispatch<SetStateAction<number>>;
    setUserDamage: Dispatch<SetStateAction<number>>;
}) {
    const flushDisplayedUserDamage = useCallback(() => {
        damageHudTimerRef.current = null;
        const nextDisplayDamage = Math.max(
            0,
            Math.round(getDisplayedUserDamageValue()),
        );
        setUserDamage(nextDisplayDamage);
    }, [damageHudTimerRef, getDisplayedUserDamageValue, setUserDamage]);

    const syncDisplayedUserDamage = useCallback((mode: BattleDisplaySyncMode = 'throttled') => {
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
    }, [damageHudTimerRef, flushDisplayedUserDamage]);

    const flushDisplayedLumens = useCallback(() => {
        lumensHudTimerRef.current = null;
        setDisplayedLumens(Math.max(0, Math.round(Number(predictedLumensRef.current) || 0)));
    }, [lumensHudTimerRef, predictedLumensRef, setDisplayedLumens]);

    const syncDisplayedLumens = useCallback((mode: BattleDisplaySyncMode = 'throttled') => {
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
    }, [flushDisplayedLumens, lumensHudTimerRef]);

    return {
        syncDisplayedLumens,
        syncDisplayedUserDamage,
    };
}
