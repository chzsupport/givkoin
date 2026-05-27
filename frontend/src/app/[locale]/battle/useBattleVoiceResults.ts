import { useCallback, type MutableRefObject } from 'react';
import type {
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
    BattleScenarioVoiceCommand,
    BattleVoiceResult,
} from './battleTypes';

type PersistBattleProgress = (overrides?: BattleProgressPersistOverrides) => void;

export function useBattleVoiceResults({
    actedVoiceIdsRef,
    finalizedVoiceIdsRef,
    persistBattleProgress,
    reportAccRef,
}: {
    actedVoiceIdsRef: MutableRefObject<Set<string>>;
    finalizedVoiceIdsRef: MutableRefObject<Set<string>>;
    persistBattleProgress: PersistBattleProgress;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
}) {
    const upsertVoiceResult = useCallback((result: BattleVoiceResult) => {
        const nextResults = [...reportAccRef.current.voiceResults.filter((item) => item.id !== result.id), result];
        reportAccRef.current.voiceResults = nextResults;
        finalizedVoiceIdsRef.current.add(result.id);
        persistBattleProgress();
    }, [finalizedVoiceIdsRef, persistBattleProgress, reportAccRef]);

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
    }, [actedVoiceIdsRef, finalizedVoiceIdsRef, upsertVoiceResult]);

    return {
        finalizeVoiceCommandResult,
    };
}
