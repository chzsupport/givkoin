'use client';

import type { Socket } from 'socket.io-client';
import type { BattlePageViewProps } from './BattlePageView';
import type { useBattlePageState } from './useBattlePageState';
import type { useBattleRefs } from './useBattleRefs';
import type { useBattleSceneLayout } from './useBattleSceneLayout';
import { useBattleBaddieRuntime } from './useBattleBaddieRuntime';
import { useBattleCombatHandlers } from './useBattleCombatHandlers';
import { useBattlePageCleanup } from './useBattlePageCleanup';
import { useBattlePersonalStatsRuntime } from './useBattlePersonalStatsRuntime';
import { useBattleProgressRuntime } from './useBattleProgressRuntime';
import { useBattleRuntimeRefs } from './useBattleRuntimeRefs';
import { useBattleScenarioRuntime } from './useBattleScenarioRuntime';
import { useBattleServerFlow } from './useBattleServerFlow';
import { useBattleViewRuntime } from './useBattleViewRuntime';
import { useBattleWeaponRuntime } from './useBattleWeaponRuntime';
import type { BattlePerformanceTier } from './useBattleEnvironment';

type BattleRuntimeUser = {
    _id?: string;
    id?: string;
    k: number;
    lumens: number;
    stars?: number;
    shopBoosts?: Parameters<typeof useBattleWeaponRuntime>[0]['weaponBoosts']['shopBoosts'];
    nightShift?: {
        isServing?: boolean;
    };
};

type BattleToastApi = {
    error: (title: string, message?: string) => void;
};

type ClearCurrentBattleLock = (override?: {
    battleId?: string;
    userId?: string;
}) => void;

export function useBattlePageRuntime<User extends BattleRuntimeUser>({
    battleLayout,
    battleVideoSources,
    clearCurrentBattleLock,
    clearDomeBlink,
    closeRulesModal,
    isBrowserOnline,
    isTabVisible,
    language,
    localePath,
    performanceTier,
    refs,
    rulesModalVisible,
    socket,
    state,
    t,
    toast,
    triggerDomeBlink,
    updateUser,
    user,
    userId,
}: {
    battleLayout: ReturnType<typeof useBattleSceneLayout>['battleLayout'];
    battleVideoSources: ReturnType<typeof useBattleSceneLayout>['battleVideoSources'];
    clearCurrentBattleLock: ClearCurrentBattleLock;
    clearDomeBlink: () => void;
    closeRulesModal: () => void;
    isBrowserOnline: boolean;
    isTabVisible: boolean;
    language: string;
    localePath: (path: string) => string;
    performanceTier: BattlePerformanceTier;
    refs: ReturnType<typeof useBattleRefs>;
    rulesModalVisible: boolean;
    socket: Socket | null;
    state: ReturnType<typeof useBattlePageState>;
    t: (key: string, fallback?: string) => string;
    toast: BattleToastApi;
    triggerDomeBlink: () => void;
    updateUser: (userData: User) => void;
    user: User | null;
    userId: string;
}): BattlePageViewProps {
    useBattleRuntimeRefs({
        battleId: state.battleId,
        isBattleActive: state.isBattleActive,
        baddies: state.baddies,
        baddiesRef: refs.baddiesRef,
        lastShotTelemetryRef: refs.lastShotTelemetryRef,
    });

    const {
        applyBattlePersonalState,
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
        applyServerNow,
        applySparkLumensToUser,
    } = useBattleProgressRuntime({
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
    });

    useBattleScenarioRuntime({
        sparkMotion: {
            spark: state.spark,
            isTabVisible,
            performanceTier,
            processedSparkIdsRef: refs.processedSparkIdsRef,
            setSpark: state.setSpark,
        },
        scenarioSpark: {
            isBattleActive: state.isBattleActive,
            battleScenario: state.battleScenario,
            battleStartsAtMs: state.battleStartsAtMs,
            battleJoinedAtMs: state.battleJoinedAtMs,
            battleJoinedRef: refs.battleJoinedRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            processedSparkIdsRef: refs.processedSparkIdsRef,
            setSpark: state.setSpark,
        },
        scenarioState: {
            isBattleActive: state.isBattleActive,
            battleId: state.battleId,
            battleStartsAtMs: state.battleStartsAtMs,
            battleScenario: state.battleScenario,
            battleJoinedAtMs: state.battleJoinedAtMs,
            isTabVisible,
            performanceTier,
            battleJoinedRef: refs.battleJoinedRef,
            lastVoiceCommandRef: refs.lastVoiceCommandRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            finalizeVoiceCommandResult,
            setWeakZone: state.setWeakZone,
            setVoiceCommand: state.setVoiceCommand,
            setVoiceProgress: state.setVoiceProgress,
        },
        countdown: {
            battleEndsAtMs: state.battleEndsAtMs,
            isBattleActive: state.isBattleActive,
            isTabVisible,
            performanceTier,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setBattleTimeLeftMs: state.setBattleTimeLeftMs,
        },
        voiceProgress: {
            voiceCommand: state.voiceCommand,
            isTabVisible,
            performanceTier,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setVoiceCommand: state.setVoiceCommand,
            setVoiceProgress: state.setVoiceProgress,
        },
    });

    const {
        addPendingUserDamage,
        bumpCombo,
        clearInFlightDamageBatches,
        consumeAccountedHitKey,
        finalizeComboForReport,
        resetCombo,
        syncDisplayedLumens,
    } = useBattlePersonalStatsRuntime({
        displayedStats: {
            damageHudTimerRef: refs.damageHudTimerRef,
            getDisplayedUserDamageValue,
            lumensHudTimerRef: refs.lumensHudTimerRef,
            predictedLumensRef: refs.predictedLumensRef,
            setDisplayedLumens: state.setDisplayedLumens,
            setUserDamage: state.setUserDamage,
        },
        pendingDamage: {
            inFlightDamageBatchesRef: refs.inFlightDamageBatchesRef,
            pendingUserDamageRef: refs.pendingUserDamageRef,
        },
        hitDeduplication: {
            accountedHitKeysRef: refs.accountedHitKeysRef,
        },
        combo: {
            battleStartsAtMs: state.battleStartsAtMs,
            comboCountRef: refs.comboCountRef,
            comboResetTimeoutRef: refs.comboResetTimeoutRef,
            comboSeriesDamageRef: refs.comboSeriesDamageRef,
            comboUpdatedAtRef: refs.comboUpdatedAtRef,
            comboX2MaxDurationRef: refs.comboX2MaxDurationRef,
            comboX2StartedAtRef: refs.comboX2StartedAtRef,
            pendingUserDamageRef: refs.pendingUserDamageRef,
            persistBattleProgress,
            phoenixStageRef: refs.phoenixStageRef,
            reportAccRef: refs.reportAccRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setComboCount: state.setComboCount,
        },
        displayedLumensSource: {
            battleId: state.battleId,
            isBattleActive: state.isBattleActive,
            predictedLumensRef: refs.predictedLumensRef,
            readBattleProgress,
            summaryVisible: state.summaryVisible,
            userLumens: user?.lumens,
        },
        comboInactiveReset: {
            isBattleActive: state.isBattleActive,
        },
    });

    const {
        ensureShotChargeState,
        getEffectiveWeaponCost,
        getPredictedHitDamage,
        updateShotPreview,
        weaponAvailability,
    } = useBattleWeaponRuntime({
        shotPreview: {
            shotPreviewRef: refs.shotPreviewRef,
        },
        weaponBoosts: {
            battleId: state.battleId,
            displayedLumens: state.displayedLumens,
            shopBoosts: user?.shopBoosts,
        },
        shotCharge: {
            predictedLumensRef: refs.predictedLumensRef,
            shotPreviewRef: refs.shotPreviewRef,
            syncDisplayedLumens,
        },
        predictedDamage: {
            isNightShiftServing: user?.nightShift?.isServing,
            weakZone: state.weakZone,
        },
    });

    useBattleServerFlow({
        join: {
            actedVoiceIdsRef: refs.actedVoiceIdsRef,
            applyBattlePersonalState,
            applyServerNow,
            battleFinalReportAcceptSecondsRef: refs.battleFinalReportAcceptSecondsRef,
            battleFinalReportRetryIntervalMsRef: refs.battleFinalReportRetryIntervalMsRef,
            battleFinalReportWindowCapacityRef: refs.battleFinalReportWindowCapacityRef,
            battleId: state.battleId,
            battleJoinedAtIsoRef: refs.battleJoinedAtIsoRef,
            battleJoinedRef: refs.battleJoinedRef,
            battleJoinRetryTimerRef: refs.battleJoinRetryTimerRef,
            battleSeenActiveThisVisitRef: refs.battleSeenActiveThisVisitRef,
            battleSyncIntervalSecondsRef: refs.battleSyncIntervalSecondsRef,
            battleSyncSlotCountRef: refs.battleSyncSlotCountRef,
            battleSyncSlotRef: refs.battleSyncSlotRef,
            finalizedVoiceIdsRef: refs.finalizedVoiceIdsRef,
            joinRequestedAtRef: refs.joinRequestedAtRef,
            lastVoiceCommandRef: refs.lastVoiceCommandRef,
            persistBattleProgress,
            processedBaddieWaveIdsRef: refs.processedBaddieWaveIdsRef,
            processedSparkIdsRef: refs.processedSparkIdsRef,
            readBattleProgress,
            reportAccRef: refs.reportAccRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setAttendanceCount: state.setAttendanceCount,
            setBattleEndsAtMs: state.setBattleEndsAtMs,
            setBattleJoinedAtMs: state.setBattleJoinedAtMs,
            setBattleScenario: state.setBattleScenario,
            setBattleStartsAtMs: state.setBattleStartsAtMs,
            setBattleTimeLeftMs: state.setBattleTimeLeftMs,
            setBaddies: state.setBaddies,
            setSpark: state.setSpark,
            setSparkRewardLumens: state.setSparkRewardLumens,
            setSummaryLoadAtMs: state.setSummaryLoadAtMs,
        },
        reports: {
            applyBattlePersonalState,
            applyServerNow,
            battleEndsAtMs: state.battleEndsAtMs,
            battleFinalReportAcceptSecondsRef: refs.battleFinalReportAcceptSecondsRef,
            battleFinalReportRetryIntervalMsRef: refs.battleFinalReportRetryIntervalMsRef,
            battleId: state.battleId,
            battleJoinedRef: refs.battleJoinedRef,
            finalReportSentRef: refs.finalReportSentRef,
            finalReportTimerRef: refs.finalReportTimerRef,
            finalizeComboForReport,
            finalizeVoiceCommandResult,
            heartbeatFailCountRef: refs.heartbeatFailCountRef,
            isBrowserOnline,
            lastVoiceCommandRef: refs.lastVoiceCommandRef,
            nextBattleReportSequenceRef: refs.nextBattleReportSequenceRef,
            pendingBattleReportRef: refs.pendingBattleReportRef,
            reportAccRef: refs.reportAccRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setAttendanceCount: state.setAttendanceCount,
            setBattleEndsAtMs: state.setBattleEndsAtMs,
            setBattleTimeLeftMs: state.setBattleTimeLeftMs,
            setConnectionLost: state.setConnectionLost,
        },
        resetDamageTracking: {
            accountedHitKeysRef: refs.accountedHitKeysRef,
            actedVoiceIdsRef: refs.actedVoiceIdsRef,
            battleJoinedAtIsoRef: refs.battleJoinedAtIsoRef,
            battleJoinRetryTimerRef: refs.battleJoinRetryTimerRef,
            battleProgressPersistTimerRef: refs.battleProgressPersistTimerRef,
            battleStartResourcesRef: refs.battleStartResourcesRef,
            clearInFlightDamageBatches,
            comboCountRef: refs.comboCountRef,
            comboSeriesDamageRef: refs.comboSeriesDamageRef,
            comboUpdatedAtRef: refs.comboUpdatedAtRef,
            comboX2MaxDurationRef: refs.comboX2MaxDurationRef,
            comboX2StartedAtRef: refs.comboX2StartedAtRef,
            confirmedUserDamageRef: refs.confirmedUserDamageRef,
            finalReportSentRef: refs.finalReportSentRef,
            finalReportTimerRef: refs.finalReportTimerRef,
            finalizedVoiceIdsRef: refs.finalizedVoiceIdsRef,
            hydratedBattleProgressKeyRef: refs.hydratedBattleProgressKeyRef,
            joinRequestedAtRef: refs.joinRequestedAtRef,
            lastBattleSyncWindowKeyRef: refs.lastBattleSyncWindowKeyRef,
            lastVoiceCommandRef: refs.lastVoiceCommandRef,
            nextBattleReportSequenceRef: refs.nextBattleReportSequenceRef,
            pendingBattleProgressOverridesRef: refs.pendingBattleProgressOverridesRef,
            pendingBattleReportRef: refs.pendingBattleReportRef,
            pendingUserDamageRef: refs.pendingUserDamageRef,
            phoenixStageRef: refs.phoenixStageRef,
            predictedLumensRef: refs.predictedLumensRef,
            processedBaddieWaveIdsRef: refs.processedBaddieWaveIdsRef,
            processedSparkIdsRef: refs.processedSparkIdsRef,
            reportAccRef: refs.reportAccRef,
            setComboCount: state.setComboCount,
            setUserDamage: state.setUserDamage,
            shotPreviewRef: refs.shotPreviewRef,
            syncDisplayedLumens,
            userLumens: user?.lumens,
        },
        currentStatus: {
            applyBattlePersonalState,
            applyServerNow,
            applyStoredBattleProgress,
            battleFinalReportAcceptSecondsRef: refs.battleFinalReportAcceptSecondsRef,
            battleFinalReportRetryIntervalMsRef: refs.battleFinalReportRetryIntervalMsRef,
            battleFinalReportWindowCapacityRef: refs.battleFinalReportWindowCapacityRef,
            battleJoinedAtIsoRef: refs.battleJoinedAtIsoRef,
            battleJoinedAtMs: state.battleJoinedAtMs,
            battleJoinedRef: refs.battleJoinedRef,
            battleSeenActiveThisVisitRef: refs.battleSeenActiveThisVisitRef,
            clearBattleProgress,
            confirmedUserDamageRef: refs.confirmedUserDamageRef,
            lastBattleIdRef: refs.lastBattleIdRef,
            lastBattleSyncWindowKeyRef: refs.lastBattleSyncWindowKeyRef,
            loadBattleSummary,
            readBattleProgress,
            redirectToTree,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setAttendanceCount: state.setAttendanceCount,
            setBattleEndsAtMs: state.setBattleEndsAtMs,
            setBattleId: state.setBattleId,
            setBattleInjuries: state.setBattleInjuries,
            setBattleJoinedAtMs: state.setBattleJoinedAtMs,
            setBattleScenario: state.setBattleScenario,
            setBattleStartsAtMs: state.setBattleStartsAtMs,
            setBattleSummary: state.setBattleSummary,
            setBattleTimeLeftMs: state.setBattleTimeLeftMs,
            setBaddies: state.setBaddies,
            setIsBattleActive: state.setIsBattleActive,
            setSpark: state.setSpark,
            setSparkRewardLumens: state.setSparkRewardLumens,
            setSummaryLoadAtMs: state.setSummaryLoadAtMs,
            setSummaryVisible: state.setSummaryVisible,
            setVoiceCommand: state.setVoiceCommand,
            setVoiceProgress: state.setVoiceProgress,
            setWeakZone: state.setWeakZone,
            summaryRequestedRef: refs.summaryRequestedRef,
            summaryVisible: state.summaryVisible,
            userId,
        },
        lifecycleTimers: {
            statusPolling: {
                isBrowserOnline,
                summaryVisible: state.summaryVisible,
            },
            storedProgressHydration: {
                applyStoredBattleProgress,
                battleId: state.battleId,
                getBattleProgressStorageKey,
                hydratedBattleProgressKeyRef: refs.hydratedBattleProgressKeyRef,
                isBattleActive: state.isBattleActive,
                readBattleProgress,
                summaryVisible: state.summaryVisible,
            },
            endSummaryTransition: {
                battleId: state.battleId,
                battleJoinedRef: refs.battleJoinedRef,
                battleTimeLeftMs: state.battleTimeLeftMs,
                computeBattleSummaryLoadAtMs,
                isBattleActive: state.isBattleActive,
                loadBattleSummary,
                setBaddies: state.setBaddies,
                setIsBattleActive: state.setIsBattleActive,
                setSpark: state.setSpark,
                setSummaryLoadAtMs: state.setSummaryLoadAtMs,
                setSummaryVisible: state.setSummaryVisible,
                setVoiceCommand: state.setVoiceCommand,
                setVoiceProgress: state.setVoiceProgress,
                setWeakZone: state.setWeakZone,
                summaryRequestedRef: refs.summaryRequestedRef,
                summaryVisible: state.summaryVisible,
            },
            summaryLoadTimer: {
                battleId: state.battleId,
                battleSummary: state.battleSummary,
                loadBattleSummary,
                summaryLoadAtMs: state.summaryLoadAtMs,
                summaryLoadTimerRef: refs.summaryLoadTimerRef,
                summaryVisible: state.summaryVisible,
            },
            heartbeatTimer: {
                battleId: state.battleId,
                battleJoinedAtMs: state.battleJoinedAtMs,
                battleJoinedRef: refs.battleJoinedRef,
                battleSyncIntervalSecondsRef: refs.battleSyncIntervalSecondsRef,
                battleSyncSlotCountRef: refs.battleSyncSlotCountRef,
                battleSyncSlotRef: refs.battleSyncSlotRef,
                battleSyncTimerRef: refs.battleSyncTimerRef,
                isBattleActive: state.isBattleActive,
                isBrowserOnline,
                serverOffsetMsRef: refs.serverOffsetMsRef,
            },
            finalReportTimer: {
                attendanceCount: state.attendanceCount,
                battleEndsAtMs: state.battleEndsAtMs,
                battleFinalReportRetryIntervalMsRef: refs.battleFinalReportRetryIntervalMsRef,
                battleFinalReportWindowCapacityRef: refs.battleFinalReportWindowCapacityRef,
                battleId: state.battleId,
                battleJoinedRef: refs.battleJoinedRef,
                finalReportSentRef: refs.finalReportSentRef,
                finalReportTimerRef: refs.finalReportTimerRef,
                summaryVisible: state.summaryVisible,
                userId: typeof user?.id === 'string' ? user.id : null,
            },
        },
    });

    const {
        checkHit,
        handleHit,
        handleShotAttempt,
        handleVisualHit,
    } = useBattleCombatHandlers({
        enemyLayerRef: refs.enemyLayerRef,
        shotAttempt: {
            actedVoiceIdsRef: refs.actedVoiceIdsRef,
            battleId: state.battleId,
            battleStartsAtMs: state.battleStartsAtMs,
            battleTimeLeftMs: state.battleTimeLeftMs,
            bumpCombo,
            comboSeriesDamageRef: refs.comboSeriesDamageRef,
            ensureShotChargeState,
            getEffectiveWeaponCost,
            isBattleActive: state.isBattleActive,
            lastShotTelemetryRef: refs.lastShotTelemetryRef,
            persistBattleProgress,
            predictedLumensRef: refs.predictedLumensRef,
            reportAccRef: refs.reportAccRef,
            resetCombo,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            updateShotPreview,
            voiceCommand: state.voiceCommand,
        },
        hitHandlers: {
            addPendingUserDamage,
            battleId: state.battleId,
            battleStartsAtMs: state.battleStartsAtMs,
            battleTimeLeftMs: state.battleTimeLeftMs,
            comboSeriesDamageRef: refs.comboSeriesDamageRef,
            consumeAccountedHitKey,
            enemyLayerRef: refs.enemyLayerRef,
            getPredictedHitDamage,
            hitIdRef: refs.hitIdRef,
            isBattleActive: state.isBattleActive,
            persistBattleProgress,
            predictedLumensRef: refs.predictedLumensRef,
            reportAccRef: refs.reportAccRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            shotPreviewRef: refs.shotPreviewRef,
            weakZone: state.weakZone,
        },
    });

    const handleImpact = useBattleBaddieRuntime({
        impact: {
            battleLayout,
            baddiesRef: refs.baddiesRef,
            persistBattleProgress,
            reportAccRef: refs.reportAccRef,
            setBaddies: state.setBaddies,
        },
        waves: {
            battleJoinedAtMs: state.battleJoinedAtMs,
            battleJoinedRef: refs.battleJoinedRef,
            battleScenario: state.battleScenario,
            battleStartsAtMs: state.battleStartsAtMs,
            baddieIdRef: refs.baddieIdRef,
            isBattleActive: state.isBattleActive,
            processedBaddieWaveIdsRef: refs.processedBaddieWaveIdsRef,
            reportAccRef: refs.reportAccRef,
            serverOffsetMsRef: refs.serverOffsetMsRef,
            setBaddies: state.setBaddies,
        },
        motion: {
            battleLayout,
            battleScenario: state.battleScenario,
            isBattleActive: state.isBattleActive,
            performanceTier,
            persistBattleProgress,
            reportAccRef: refs.reportAccRef,
            setBaddies: state.setBaddies,
            triggerDomeBlink,
        },
    });

    useBattlePageCleanup({
        battleJoinRetryTimerRef: refs.battleJoinRetryTimerRef,
        comboResetTimeoutRef: refs.comboResetTimeoutRef,
        battleSyncTimerRef: refs.battleSyncTimerRef,
        summaryLoadTimerRef: refs.summaryLoadTimerRef,
        damageHudTimerRef: refs.damageHudTimerRef,
        lumensHudTimerRef: refs.lumensHudTimerRef,
        setBattleJoinedAtMs: state.setBattleJoinedAtMs,
        setSummaryLoadAtMs: state.setSummaryLoadAtMs,
        clearInFlightDamageBatches,
        clearDomeBlink,
    });

    const {
        comboMultiplier,
        handleSparkCollect,
        showActiveBattleScene,
        showSummaryBackdrop,
    } = useBattleViewRuntime({
        comboCount: state.comboCount,
        isBattleActive: state.isBattleActive,
        summaryVisible: state.summaryVisible,
        sparkCollect: {
            battleTimeLeftMs: state.battleTimeLeftMs,
            isBattleActive: state.isBattleActive,
            onLumensGained: applySparkLumensToUser,
            persistBattleProgress,
            predictedLumensRef: refs.predictedLumensRef,
            processedSparkIdsRef: refs.processedSparkIdsRef,
            reportAccRef: refs.reportAccRef,
            setSpark: state.setSpark,
            spark: state.spark,
            sparkCollectingRef: refs.sparkCollectingRef,
            sparkRewardLumens: state.sparkRewardLumens,
            syncDisplayedLumens,
        },
    });

    return {
        activeSceneProps: {
            enemyLayerRef: refs.enemyLayerRef,
            battleVideoSources,
            battleLayout,
            performanceTier,
            weakZone: state.weakZone,
            baddies: state.baddies,
            onValidHit: handleHit,
            onVisualHit: handleVisualHit,
            checkHit,
            onImpact: handleImpact,
            onShotAttempt: handleShotAttempt,
            weaponAvailability,
        },
        battleSummary: state.battleSummary,
        battleTimeLeftMs: state.battleTimeLeftMs,
        closeRulesModal,
        comboHudProps: {
            userDamage: state.userDamage,
            attendanceCount: state.attendanceCount,
            displayedLumens: state.displayedLumens,
            comboCount: state.comboCount,
            comboMultiplier,
        },
        connectionLost: state.connectionLost,
        handleSummaryModalPointer,
        localePath,
        redirectToTree,
        rulesModalVisible,
        showActiveBattleScene,
        showSummaryBackdrop,
        sparkPickupProps: {
            spark: state.spark,
            onCollect: handleSparkCollect,
        },
        summaryLoading: state.summaryLoading,
        summaryVisible: state.summaryVisible,
        t,
        voiceCommand: state.voiceCommand,
        voiceProgress: state.voiceProgress,
    };
}
