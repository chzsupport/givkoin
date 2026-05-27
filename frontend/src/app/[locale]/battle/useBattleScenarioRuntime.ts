'use client';

import { useBattleCountdown } from './useBattleCountdown';
import { useBattleScenarioSpark } from './useBattleScenarioSpark';
import { useBattleScenarioState } from './useBattleScenarioState';
import { useBattleSparkMotion } from './useBattleSparkMotion';
import { useBattleVoiceProgress } from './useBattleVoiceProgress';

type BattleScenarioRuntimeOptions = {
    countdown: Parameters<typeof useBattleCountdown>[0];
    scenarioSpark: Parameters<typeof useBattleScenarioSpark>[0];
    scenarioState: Parameters<typeof useBattleScenarioState>[0];
    sparkMotion: Parameters<typeof useBattleSparkMotion>[0];
    voiceProgress: Parameters<typeof useBattleVoiceProgress>[0];
};

export function useBattleScenarioRuntime({
    countdown,
    scenarioSpark,
    scenarioState,
    sparkMotion,
    voiceProgress,
}: BattleScenarioRuntimeOptions) {
    useBattleSparkMotion(sparkMotion);
    useBattleScenarioSpark(scenarioSpark);
    useBattleScenarioState(scenarioState);
    useBattleCountdown(countdown);
    useBattleVoiceProgress(voiceProgress);
}
