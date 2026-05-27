'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
    getBattleElapsedMs,
    isSameVoiceCommandState,
    isSameWeakZoneState,
} from './battleClientState';
import {
    PERSONAL_STATE_HIDDEN_TICK_MS,
    PERSONAL_STATE_VISIBLE_TICK_MS,
} from './battleConstants';
import type {
    BattleActiveVoiceCommand,
    BattleScenario,
    BattleScenarioVoiceCommand,
    BattleWeakZone,
} from './battleTypes';
import type { BattlePerformanceTier } from './useBattleEnvironment';

function getScenarioStateTickMs(isTabVisible: boolean, performanceTier: BattlePerformanceTier) {
    if (isTabVisible) {
        return performanceTier === 'high' ? PERSONAL_STATE_VISIBLE_TICK_MS : 1500;
    }
    return performanceTier === 'high' ? PERSONAL_STATE_HIDDEN_TICK_MS : PERSONAL_STATE_HIDDEN_TICK_MS * 2;
}

export function useBattleScenarioState({
    isBattleActive,
    battleId,
    battleStartsAtMs,
    battleScenario,
    battleJoinedAtMs,
    isTabVisible,
    performanceTier,
    battleJoinedRef,
    lastVoiceCommandRef,
    serverOffsetMsRef,
    finalizeVoiceCommandResult,
    setWeakZone,
    setVoiceCommand,
    setVoiceProgress,
}: {
    isBattleActive: boolean;
    battleId: string | null;
    battleStartsAtMs: number | null;
    battleScenario: BattleScenario | null;
    battleJoinedAtMs: number | null;
    isTabVisible: boolean;
    performanceTier: BattlePerformanceTier;
    battleJoinedRef: MutableRefObject<boolean>;
    lastVoiceCommandRef: MutableRefObject<BattleScenarioVoiceCommand | null>;
    serverOffsetMsRef: MutableRefObject<number>;
    finalizeVoiceCommandResult: (command: BattleScenarioVoiceCommand | null) => void;
    setWeakZone: Dispatch<SetStateAction<BattleWeakZone | null>>;
    setVoiceCommand: Dispatch<SetStateAction<BattleActiveVoiceCommand | null>>;
    setVoiceProgress: Dispatch<SetStateAction<number>>;
}) {
    useEffect(() => {
        if (!isBattleActive || !battleId || battleStartsAtMs == null || !battleScenario || battleJoinedAtMs == null || !battleJoinedRef.current) {
            if (lastVoiceCommandRef.current) {
                finalizeVoiceCommandResult(lastVoiceCommandRef.current);
                lastVoiceCommandRef.current = null;
            }
            setWeakZone(null);
            setVoiceCommand(null);
            setVoiceProgress(0);
            return;
        }

        const syncScenarioBattleState = () => {
            const elapsedMs = getBattleElapsedMs(battleStartsAtMs, serverOffsetMsRef.current);
            const activeWeak = battleScenario.weakZones.find((item) => elapsedMs >= item.startOffsetMs && elapsedMs < item.endOffsetMs) || null;
            const activeVoice = battleScenario.voiceCommands.find((item) => elapsedMs >= item.startOffsetMs && elapsedMs < item.endOffsetMs) || null;

            if (lastVoiceCommandRef.current && (!activeVoice || activeVoice.id !== lastVoiceCommandRef.current.id)) {
                finalizeVoiceCommandResult(lastVoiceCommandRef.current);
            }
            lastVoiceCommandRef.current = activeVoice;

            const nextWeakZone = activeWeak
                ? {
                    id: activeWeak.id,
                    active: true,
                    center: activeWeak.center,
                    radius: activeWeak.radius,
                }
                : null;
            const nextVoiceCommand = activeVoice
                ? {
                    id: activeVoice.id,
                    text: activeVoice.text,
                    endsAt: battleStartsAtMs + activeVoice.endOffsetMs,
                    requireShot: activeVoice.requireShot,
                    durationMs: activeVoice.durationMs,
                }
                : null;

            setWeakZone((prev) => (isSameWeakZoneState(prev, nextWeakZone) ? prev : nextWeakZone));
            setVoiceCommand((prev) => (isSameVoiceCommandState(prev, nextVoiceCommand) ? prev : nextVoiceCommand));
            if (!nextVoiceCommand) {
                setVoiceProgress(0);
            }
        };

        syncScenarioBattleState();
        const interval = window.setInterval(syncScenarioBattleState, getScenarioStateTickMs(isTabVisible, performanceTier));
        return () => window.clearInterval(interval);
    }, [
        battleId,
        battleJoinedAtMs,
        battleJoinedRef,
        battleScenario,
        battleStartsAtMs,
        finalizeVoiceCommandResult,
        isBattleActive,
        isTabVisible,
        lastVoiceCommandRef,
        performanceTier,
        serverOffsetMsRef,
        setVoiceCommand,
        setVoiceProgress,
        setWeakZone,
    ]);
}
