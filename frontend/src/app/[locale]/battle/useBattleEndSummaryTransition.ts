import {
    useEffect,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import type {
    BattleActiveVoiceCommand,
    BattleBaddieState,
    BattleSparkState,
    BattleWeakZone,
} from './battleTypes';

type LoadBattleSummary = (id: string, options?: { silent?: boolean }) => Promise<unknown>;

export function useBattleEndSummaryTransition({
    battleId,
    battleJoinedRef,
    battleTimeLeftMs,
    computeBattleSummaryLoadAtMs,
    isBattleActive,
    loadBattleSummary,
    setBaddies,
    setIsBattleActive,
    setSpark,
    setSummaryLoadAtMs,
    setSummaryVisible,
    setVoiceCommand,
    setVoiceProgress,
    setWeakZone,
    summaryRequestedRef,
    summaryVisible,
}: {
    battleId: string | null;
    battleJoinedRef: MutableRefObject<boolean>;
    battleTimeLeftMs: number;
    computeBattleSummaryLoadAtMs: () => number | null;
    isBattleActive: boolean;
    loadBattleSummary: LoadBattleSummary;
    setBaddies: Dispatch<SetStateAction<BattleBaddieState[]>>;
    setIsBattleActive: Dispatch<SetStateAction<boolean>>;
    setSpark: Dispatch<SetStateAction<BattleSparkState | null>>;
    setSummaryLoadAtMs: Dispatch<SetStateAction<number | null>>;
    setSummaryVisible: Dispatch<SetStateAction<boolean>>;
    setVoiceCommand: Dispatch<SetStateAction<BattleActiveVoiceCommand | null>>;
    setVoiceProgress: Dispatch<SetStateAction<number>>;
    setWeakZone: Dispatch<SetStateAction<BattleWeakZone | null>>;
    summaryRequestedRef: MutableRefObject<string | null>;
    summaryVisible: boolean;
}) {
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
    }, [
        battleId,
        battleJoinedRef,
        battleTimeLeftMs,
        computeBattleSummaryLoadAtMs,
        isBattleActive,
        loadBattleSummary,
        setBaddies,
        setIsBattleActive,
        setSpark,
        setSummaryLoadAtMs,
        setSummaryVisible,
        setVoiceCommand,
        setVoiceProgress,
        setWeakZone,
        summaryRequestedRef,
        summaryVisible,
    ]);
}
