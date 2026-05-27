'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BattleActiveVoiceCommand } from './battleTypes';
import type { BattlePerformanceTier } from './useBattleEnvironment';

function getVoiceTickMs(isTabVisible: boolean, performanceTier: BattlePerformanceTier) {
    if (!isTabVisible) return 500;
    return performanceTier === 'high' ? 120 : 200;
}

export function useBattleVoiceProgress({
    voiceCommand,
    isTabVisible,
    performanceTier,
    serverOffsetMsRef,
    setVoiceCommand,
    setVoiceProgress,
}: {
    voiceCommand: BattleActiveVoiceCommand | null;
    isTabVisible: boolean;
    performanceTier: BattlePerformanceTier;
    serverOffsetMsRef: MutableRefObject<number>;
    setVoiceCommand: Dispatch<SetStateAction<BattleActiveVoiceCommand | null>>;
    setVoiceProgress: Dispatch<SetStateAction<number>>;
}) {
    useEffect(() => {
        if (!voiceCommand) return;
        const tick = () => {
            const nowByServer = Date.now() + serverOffsetMsRef.current;
            const left = Math.max(0, voiceCommand.endsAt - nowByServer);
            const progress = 1 - left / voiceCommand.durationMs;
            setVoiceProgress(Math.max(0, Math.min(1, progress)));
            if (left <= 0) {
                setVoiceCommand(null);
            }
        };

        tick();
        const interval = window.setInterval(tick, getVoiceTickMs(isTabVisible, performanceTier));
        return () => window.clearInterval(interval);
    }, [isTabVisible, performanceTier, serverOffsetMsRef, setVoiceCommand, setVoiceProgress, voiceCommand]);
}
