'use client';

import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { FloatingSideAds } from '@/components/FloatingSideAds';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFloatingSideAds } from '@/hooks/useFloatingSideAds';
import { useI18n } from '@/context/I18nContext';
import { GratitudeBackground } from '@/components/gratitude/GratitudeBackground';
import { GratitudeEntryPanel } from '@/components/gratitude/GratitudeEntryPanel';
import { GratitudeHeader } from '@/components/gratitude/GratitudeHeader';
import { useGratitudeDailyEntries } from '@/components/gratitude/useGratitudeDailyEntries';

export default function PracticeGratitudePage() {
  const { updateUser } = useAuth();
  const toast = useToast();
  const { t, localePath } = useI18n();
  const { adHeight, adWidth, isDesktop, pageRef, leftAdRef, rightAdRef } = useFloatingSideAds();
  const {
    entries,
    rewarded,
    isLoading,
    savingIndex,
    rewardConfig,
    rewardedCount,
    handleEntryChange,
    handleEntrySave,
  } = useGratitudeDailyEntries({
    t,
    toast,
    updateUser,
  });

  return (
    <div
      ref={pageRef}
      className="relative w-full bg-[#050510] text-slate-200 font-sans selection:bg-indigo-500/30"
    >
      <GratitudeBackground />

      <FloatingSideAds
        adHeight={adHeight}
        adWidth={adWidth}
        isDesktop={isDesktop}
        leftAdRef={leftAdRef}
        page="practice_gratitude"
        rightAdRef={rightAdRef}
        leftPlacement="practice_gratitude_sidebar_left"
        rightPlacement="practice_gratitude_sidebar_right"
      />

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="practice_gratitude"
              placement="practice_gratitude_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          <GratitudeHeader localePath={localePath} rewardedCount={rewardedCount} t={t} />
          <GratitudeEntryPanel
            entries={entries}
            isLoading={isLoading}
            onEntryChange={handleEntryChange}
            onEntrySave={handleEntrySave}
            rewarded={rewarded}
            rewardConfig={rewardConfig}
            savingIndex={savingIndex}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

