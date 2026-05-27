'use client';

import type { Socket } from 'socket.io-client';
import type { useBattlePageState } from './useBattlePageState';
import type { useBattleRefs } from './useBattleRefs';
import { useBattleProgressFlushOnPageExit } from './useBattleProgressFlushOnPageExit';
import { useBattleProgressState } from './useBattleProgressState';
import { useBattleServerClock } from './useBattleServerClock';
import { useBattleSummaryRuntime } from './useBattleSummaryRuntime';
import { useBattleUserEconomySync } from './useBattleUserEconomySync';
import { useBattleVoiceResults } from './useBattleVoiceResults';

type BattleEconomyUser = {
    _id?: string;
    id?: string;
    k: number;
    lumens: number;
    stars?: number;
};

type BattleToastApi = {
    error: (title: string, message?: string) => void;
};

type ClearCurrentBattleLock = (override?: {
    battleId?: string;
    userId?: string;
}) => void;

export function useBattleProgressRuntime<User extends BattleEconomyUser>({
    clearCurrentBattleLock,
    language,
    localePath,
    refs,
    socket,
    state,
    t,
    toast,
    updateUser,
    user,
    userId,
}: {
    clearCurrentBattleLock: ClearCurrentBattleLock;
    language: string;
    localePath: (path: string) => string;
    refs: ReturnType<typeof useBattleRefs>;
    socket: Socket | null;
    state: ReturnType<typeof useBattlePageState>;
    t: (key: string) => string;
    toast: BattleToastApi;
    updateUser: (userData: User) => void;
    user: User | null;
    userId: string;
}) {
    const { applyServerNow, computeBattleSummaryLoadAtMs } = useBattleServerClock({
        battleEndsAtMs: state.battleEndsAtMs,
        serverOffsetMsRef: refs.serverOffsetMsRef,
    });

    const {
        applyBattlePersonalState,
        applyStoredBattleProgress,
        clearBattleProgress,
        flushBattleProgress,
        getBattleProgressStorageKey,
        getDisplayedUserDamageValue,
        persistBattleProgress,
        readBattleProgress,
    } = useBattleProgressState({
        actedVoiceIdsRef: refs.actedVoiceIdsRef,
        battleId: state.battleId,
        battleJoinedAtIsoRef: refs.battleJoinedAtIsoRef,
        battleJoinedAtMs: state.battleJoinedAtMs,
        battleProgressPersistTimerRef: refs.battleProgressPersistTimerRef,
        battleStartResourcesRef: refs.battleStartResourcesRef,
        comboCountRef: refs.comboCountRef,
        comboSeriesDamageRef: refs.comboSeriesDamageRef,
        comboUpdatedAtRef: refs.comboUpdatedAtRef,
        comboX2MaxDurationRef: refs.comboX2MaxDurationRef,
        comboX2StartedAtRef: refs.comboX2StartedAtRef,
        confirmedUserDamageRef: refs.confirmedUserDamageRef,
        finalizedVoiceIdsRef: refs.finalizedVoiceIdsRef,
        lastBattleIdRef: refs.lastBattleIdRef,
        nextBattleReportSequenceRef: refs.nextBattleReportSequenceRef,
        pendingBattleProgressOverridesRef: refs.pendingBattleProgressOverridesRef,
        pendingBattleReportRef: refs.pendingBattleReportRef,
        pendingUserDamageRef: refs.pendingUserDamageRef,
        phoenixStageRef: refs.phoenixStageRef,
        predictedLumensRef: refs.predictedLumensRef,
        processedBaddieWaveIdsRef: refs.processedBaddieWaveIdsRef,
        processedSparkIdsRef: refs.processedSparkIdsRef,
        reportAccRef: refs.reportAccRef,
        serverOffsetMsRef: refs.serverOffsetMsRef,
        setBattleJoinedAtMs: state.setBattleJoinedAtMs,
        setComboCount: state.setComboCount,
        setDisplayedLumens: state.setDisplayedLumens,
        setUserDamage: state.setUserDamage,
        userId: user?._id,
    });

    const { applySparkLumensToUser, syncUserBattleEconomy } = useBattleUserEconomySync({
        battleStartResourcesRef: refs.battleStartResourcesRef,
        predictedLumensRef: refs.predictedLumensRef,
        readBattleProgress,
        updateUser,
        user,
    });

    useBattleProgressFlushOnPageExit({
        battleProgressPersistTimerRef: refs.battleProgressPersistTimerRef,
        flushBattleProgress,
        pendingBattleProgressOverridesRef: refs.pendingBattleProgressOverridesRef,
    });

    const { finalizeVoiceCommandResult } = useBattleVoiceResults({
        actedVoiceIdsRef: refs.actedVoiceIdsRef,
        finalizedVoiceIdsRef: refs.finalizedVoiceIdsRef,
        persistBattleProgress,
        reportAccRef: refs.reportAccRef,
    });

    const {
        handleSummaryModalPointer,
        loadBattleSummary,
        redirectToTree,
    } = useBattleSummaryRuntime({
        behaviorGuard: {
            summaryVisible: state.summaryVisible,
            battleSummary: state.battleSummary,
        },
        loader: {
            battleSummary: state.battleSummary,
            clearBattleProgress,
            language,
            setBattleSummary: state.setBattleSummary,
            setSummaryLoadAtMs: state.setSummaryLoadAtMs,
            setSummaryLoading: state.setSummaryLoading,
            syncUserBattleEconomy,
            t,
            toast,
        },
        redirect: {
            battleId: state.battleId,
            clearBattleProgress,
            clearCurrentBattleLock,
            lastBattleIdRef: refs.lastBattleIdRef,
            localePath,
            userId,
        },
        readyListener: {
            socket,
            battleId: state.battleId,
            lastBattleIdRef: refs.lastBattleIdRef,
            summaryRequestedRef: refs.summaryRequestedRef,
            language,
            syncUserBattleEconomy,
            setBattleSummary: state.setBattleSummary,
            setSummaryLoadAtMs: state.setSummaryLoadAtMs,
            clearBattleProgress,
        },
    });

    return {
        applyBattlePersonalState,
        applyServerNow,
        applySparkLumensToUser,
        applyStoredBattleProgress,
        clearBattleProgress,
        computeBattleSummaryLoadAtMs,
        finalizeVoiceCommandResult,
        getBattleProgressStorageKey,
        getDisplayedUserDamageValue,
        handleSummaryModalPointer,
        loadBattleSummary,
        persistBattleProgress,
        readBattleProgress,
        redirectToTree,
    };
}
