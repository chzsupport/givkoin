'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { TreeActionButtons } from '@/components/tree-page/TreeActionButtons';
import { TreeHealModal } from '@/components/tree-page/TreeHealModal';
import { TreeHealingProgress } from '@/components/tree-page/TreeHealingProgress';
import { TreeNavigationLinks } from '@/components/tree-page/TreeNavigationLinks';
import { TreeRadianceBursts } from '@/components/tree-page/TreeRadianceBursts';
import { TreeRightPanel } from '@/components/tree-page/TreeRightPanel';
import { TreeShareLightModal } from '@/components/tree-page/TreeShareLightModal';
import { useTreePageRuntime } from '@/components/tree-page/useTreePageRuntime';

const TreeScene = dynamic(() => import('./TreeScene'), { ssr: false });
const EntityAskModal = dynamic(
  () => import('@/components/entity/EntityAskModal').then((m) => m.EntityAskModal),
  { ssr: false },
);
const DailyStreakCalendar = dynamic(
  () => import('@/components/cabinet/DailyStreakCalendar'),
  { ssr: false },
);
const SearchPortal = dynamic(
  () => import('@/components/chat/SearchPortal').then((m) => m.SearchPortal),
  { ssr: false },
);

export default function TreePage() {
  const {
    activePanel,
    cancelSearch,
    handleCollectFruit,
    handleFindPartner,
    handleHealTree,
    handleRadianceBurstComplete,
    handleShareLumens,
    handleTakeCharge,
    hasTrauma,
    healLumens,
    healingPercent,
    healingRemaining,
    isEntityAskOpen,
    isFoundNotice,
    isFruitAvailable,
    isHealOpen,
    isHealing,
    isRightPanelOpen,
    isSearching,
    isShareOpen,
    isShareSending,
    isTabVisible,
    isUnderAttack,
    localePath,
    openPanel,
    radianceBursts,
    setHealLumens,
    setIsEntityAskOpen,
    setIsHealOpen,
    setIsRightPanelOpen,
    setIsShareOpen,
    setShareAmountLm,
    shareAmountLm,
    shareCountToday,
    shareDailyLimit,
    solarStatus,
    solarTimeLeft,
    t,
    takingDuration,
    user,
  } = useTreePageRuntime();

  return (
    <>
      <DailyStreakCalendar inline={false} />
      <div className="fixed inset-0 z-0">
        <Image src="/background.jpg" alt="Milky Way" fill quality={60} sizes="100vw" className="object-cover opacity-90" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <TreeScene isTabVisible={isTabVisible} />

      <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden" style={{ top: 'var(--header-height, 64px)', bottom: 0 }}>
        <TreeNavigationLinks localePath={localePath} t={t} />

        <TreeActionButtons
          hasTrauma={hasTrauma}
          isFruitAvailable={isFruitAvailable}
          isUnderAttack={isUnderAttack}
          localePath={localePath}
          onCollectFruit={handleCollectFruit}
          onHealOpen={() => setIsHealOpen(true)}
          onOpenPanel={openPanel}
          t={t}
        />

        <TreeHealingProgress
          healingPercent={healingPercent}
          healingRemaining={healingRemaining}
          hasTrauma={hasTrauma}
          t={t}
        />

        <TreeRightPanel
          activePanel={activePanel}
          isOpen={isRightPanelOpen}
          localePath={localePath}
          onAskEntity={() => setIsEntityAskOpen(true)}
          onClose={() => setIsRightPanelOpen(false)}
          onFindPartner={handleFindPartner}
          onOpenShare={() => setIsShareOpen(true)}
          onTakeCharge={handleTakeCharge}
          shareCountToday={shareCountToday}
          shareDailyLimit={shareDailyLimit}
          solarStatus={solarStatus}
          solarTimeLeft={solarTimeLeft}
          t={t}
          takingDuration={takingDuration}
          user={user}
        />
      </div>

      <TreeShareLightModal
        availableLumens={user?.lumens ?? 0}
        isOpen={isShareOpen}
        isSending={isShareSending}
        onClose={() => setIsShareOpen(false)}
        onSend={handleShareLumens}
        onShareAmountChange={setShareAmountLm}
        shareAmountLm={shareAmountLm}
        t={t}
      />

      <TreeHealModal
        availableLumens={user?.lumens ?? 0}
        healLumens={healLumens}
        isHealing={isHealing}
        isOpen={isHealOpen}
        onClose={() => setIsHealOpen(false)}
        onHeal={handleHealTree}
        onHealLumensChange={setHealLumens}
        t={t}
      />

      <TreeRadianceBursts
        bursts={radianceBursts}
        onBurstComplete={handleRadianceBurstComplete}
      />

      <EntityAskModal
        isOpen={isEntityAskOpen}
        onClose={() => setIsEntityAskOpen(false)}
        entityName={user?.entity?.name}
      />

      <AnimatePresence>
        {isSearching && (
          <SearchPortal onCancel={cancelSearch} />
        )}
        {isFoundNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40 backdrop-blur-sm pointer-events-none"
          >
            <div className="px-6 py-3 rounded-full bg-emerald-600/90 border border-emerald-300/60 text-white text-body font-semibold shadow-lg pointer-events-auto">
              {t('chat.partner_found_wait')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        html, body {
          overflow: hidden;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 3s infinite ease-in-out;
        }
      `}</style>
    </>
  );
}
