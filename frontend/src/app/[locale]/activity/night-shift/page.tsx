'use client';

import { useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { EndShiftModal } from './EndShiftModal';
import { NightShiftAssessmentCards } from './NightShiftAssessmentCards';
import { NightShiftClearanceLog } from './NightShiftClearanceLog';
import { NightShiftHeader } from './NightShiftHeader';
import { NightShiftProgressCards } from './NightShiftProgressCards';
import { NightShiftRadarPanel } from './NightShiftRadarPanel';
import { NightShiftReportPanel } from './NightShiftReportPanel';
import { useNightShiftActions } from './useNightShiftActions';
import { useNightShiftCountdown } from './useNightShiftCountdown';
import { useNightShiftLayout } from './useNightShiftLayout';
import { useNightShiftRadarRuntime } from './useNightShiftRadarRuntime';
import { useNightShiftStatus } from './useNightShiftStatus';
import { useNightShiftViewData } from './useNightShiftViewData';
import type { EndShiftResult } from './nightShiftTypes';

export default function NightShiftPage() {
    const { isAuthenticated } = useAuth();
    const { t, localePath } = useI18n();
    const { status, setStatus, runtime, setRuntime, fetchStatus } = useNightShiftStatus(isAuthenticated);
    const [endShiftData, setEndShiftData] = useState<EndShiftResult | null>(null);
    const { windowWidth, sideAdSlot, isDesktop } = useNightShiftLayout();
    const shiftCountdownMs = useNightShiftCountdown(status);
    const {
        elapsedTime,
        radarTarget,
        radarTargetId,
        radarTargetUrl,
    } = useNightShiftRadarRuntime(Boolean(status?.isServing), runtime);
    const { handleStartShift, handleEndShift } = useNightShiftActions({
        runtime,
        setRuntime,
        setStatus,
        fetchStatus,
        setEndShiftData,
        t,
    });

    const {
        totalResolvedAnomalies,
        currentHourAnomalies,
        hourlyGoal,
        currentHourProgress,
        currentHourRemaining,
        totalEarnings,
        payableHours,
        consecutiveEmptyWindows,
        pendingSettlementTime,
        hourTempo,
        postRisk,
        recentResolved,
        radarTargetLabel,
        formatPageLabel,
        formatShortTime,
    } = useNightShiftViewData({
        status,
        runtime,
        radarTarget,
        radarTargetId,
        t,
    });

    return (
        <div className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-purple-500/30`}>
            {/* Фоновые эффекты */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-[#050510] to-[#050510]" />
                <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
            </div>

            <div className="relative z-10 flex flex-1 min-h-0">
                {/* Левый рекламный блок (как в Фортуне) */}
                <StickySideAdRail adSlot={sideAdSlot} page="night_shift" placement="night_shift_sidebar_left" />

                {/* Центральный контент */}
                <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
                    {/* MOBILE AD BLOCK */}
                    <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
                        <AdaptiveAdWrapper
                            page="night_shift"
                            placement="night_shift_header"
                            strategy="mobile_tablet_adaptive"
                        />
                    </div>

                    <NightShiftHeader
                        activityHref={localePath('/cabinet/activity')}
                        isServing={Boolean(status?.isServing)}
                        shiftCountdownMs={shiftCountdownMs}
                        elapsedTime={elapsedTime}
                        onStartShift={handleStartShift}
                        onEndShift={handleEndShift}
                        t={t}
                    />

                    <div className="page-content-wide space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                            <NightShiftRadarPanel
                                isServing={Boolean(status?.isServing)}
                                radarTargetLabel={radarTargetLabel}
                                radarTargetUrl={radarTargetUrl}
                                localePath={localePath}
                                t={t}
                            />

                            <NightShiftReportPanel
                                isServing={Boolean(status?.isServing)}
                                elapsedTime={elapsedTime}
                                totalTimeMs={status?.stats?.totalTimeMs}
                                totalResolvedAnomalies={totalResolvedAnomalies}
                                currentHourAnomalies={currentHourAnomalies}
                                acceptedAnomalies={status?.acceptedAnomaliesCurrentSession ?? totalResolvedAnomalies}
                                t={t}
                            />
                        </div>

                        <NightShiftProgressCards
                            currentHourProgress={currentHourProgress}
                            currentHourAnomalies={currentHourAnomalies}
                            hourlyGoal={hourlyGoal}
                            currentHourRemaining={currentHourRemaining}
                            totalEarnings={totalEarnings}
                            consecutiveEmptyWindows={consecutiveEmptyWindows}
                            payableHours={payableHours}
                            pendingSettlementTime={pendingSettlementTime}
                            t={t}
                        />

                        <NightShiftAssessmentCards
                            hourTempo={hourTempo}
                            postRisk={postRisk}
                            currentHourRemaining={currentHourRemaining}
                            consecutiveEmptyWindows={consecutiveEmptyWindows}
                            t={t}
                        />

                        <NightShiftClearanceLog
                            entries={recentResolved}
                            formatPageLabel={formatPageLabel}
                            formatShortTime={formatShortTime}
                            t={t}
                        />
                    </div>
                </div>

                {/* Правый рекламный блок */}
                <StickySideAdRail adSlot={sideAdSlot} page="night_shift" placement="night_shift_sidebar_right" />
            </div>

            <EndShiftModal
                data={endShiftData}
                onClose={() => setEndShiftData(null)}
                t={t}
            />

            <style jsx>{`
                @keyframes scan {
                    0% { top: 0; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
}

