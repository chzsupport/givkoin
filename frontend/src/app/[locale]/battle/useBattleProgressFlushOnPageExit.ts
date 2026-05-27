import { useEffect, type MutableRefObject } from 'react';
import type { BattleProgressPersistOverrides } from './battleTypes';

type FlushBattleProgress = (overrides?: BattleProgressPersistOverrides | null) => void;

export function useBattleProgressFlushOnPageExit({
    battleProgressPersistTimerRef,
    flushBattleProgress,
    pendingBattleProgressOverridesRef,
}: {
    battleProgressPersistTimerRef: MutableRefObject<number | null>;
    flushBattleProgress: FlushBattleProgress;
    pendingBattleProgressOverridesRef: MutableRefObject<BattleProgressPersistOverrides | null>;
}) {
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
    }, [battleProgressPersistTimerRef, flushBattleProgress, pendingBattleProgressOverridesRef]);
}
