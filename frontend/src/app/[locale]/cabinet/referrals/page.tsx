'use client';

import { PageBackground } from '@/components/PageBackground';
import { ManualReferralBoostModal } from '@/components/cabinet-referrals/ManualReferralBoostModal';
import { ReferralHeader } from '@/components/cabinet-referrals/ReferralHeader';
import { ReferralPageStyles } from '@/components/cabinet-referrals/ReferralPageStyles';
import { ReferralStatsPanel } from '@/components/cabinet-referrals/ReferralStatsPanel';
import { useCabinetReferrals } from '@/components/cabinet-referrals/useCabinetReferrals';
import { useI18n } from '@/context/I18nContext';

export default function CabinetReferralsPage() {
  const { t } = useI18n();
  const {
    activeMessage,
    boostModalOpen,
    copied,
    handleCopy,
    loadMoreReferrals,
    loadingMore,
    loadingStep,
    manualBoost,
    referralLink,
    setBoostModalOpen,
    startManualBoostStep,
    stats,
    user,
  } = useCabinetReferrals(t);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <PageBackground />

      <div className="custom-scrollbar relative z-10 h-full overflow-y-auto px-6 py-4 lg:no-scrollbar">
        <div className="space-y-6 pb-6">
          <ReferralHeader
            copied={copied}
            hasNickname={Boolean(user?.nickname)}
            onCopy={handleCopy}
            onOpenBoost={() => setBoostModalOpen(true)}
            referralLink={referralLink}
            t={t}
          />

          <ReferralStatsPanel
            loadingMore={loadingMore}
            onLoadMore={() => void loadMoreReferrals()}
            stats={stats}
            t={t}
          />
        </div>
      </div>

      {boostModalOpen && (
        <ManualReferralBoostModal
          activeMessage={activeMessage}
          loadingStep={loadingStep}
          manualBoost={manualBoost}
          onClose={() => setBoostModalOpen(false)}
          onStartStep={(step) => void startManualBoostStep(step)}
          t={t}
        />
      )}

      <ReferralPageStyles />
    </div>
  );
}
