'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useI18n } from '@/context/I18nContext';
import { GalaxyHeader } from '@/components/galaxy/GalaxyHeader';
import { GalaxyInfoCards } from '@/components/galaxy/GalaxyInfoCards';
import { GalaxySpaceOverlay } from '@/components/galaxy/GalaxySpaceOverlay';
import { GalaxyCreatePanel } from '@/components/galaxy/GalaxyCreatePanel';
import { GalaxyTabs } from '@/components/galaxy/GalaxyTabs';
import { GalaxyWishList } from '@/components/galaxy/GalaxyWishList';
import { GalaxyWishLaunchTrail } from '@/components/galaxy/GalaxyWishLaunchTrail';
import { GalaxyWishModals } from '@/components/galaxy/GalaxyWishModals';
import type { GalaxyTab } from '@/components/galaxy/types';
import { useGalaxyLayout } from '@/components/galaxy/useGalaxyLayout';
import { useGalaxyWishActions } from '@/components/galaxy/useGalaxyWishActions';
import { useGalaxyWishes } from '@/components/galaxy/useGalaxyWishes';
import { isWishEditable } from '@/components/galaxy/wishUtils';

export default function GalaxyPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { t, localePath } = useI18n();
  const userId = user?._id ? String(user._id) : '';

  const [activeTab, setActiveTab] = useState<GalaxyTab>('others');
  const { windowWidth, isLandscape, sideAdSlot, isDesktop } = useGalaxyLayout();
  const {
    wishes,
    setWishes,
    wishHasMore,
    loadingMoreWishes,
    createdToday,
    setCreatedToday,
    fulfilledToday,
    setFulfilledToday,
    fulfilledThisMonth,
    setFulfilledThisMonth,
    loadMoreWishes,
  } = useGalaxyWishes({
    userId,
    refreshUser,
  });
  const userK = user?.k ?? 0;
  const {
    canCreate,
    contactInfo,
    editWish,
    editWishText,
    fulfillModalWish,
    isSavingWishEdit,
    launchId,
    markFulfilledWish,
    selectedWish,
    sending,
    showSuccess,
    showSupportConfirm,
    supportAmount,
    supportModalWish,
    wishText,
    cancelSupport,
    handleCreate,
    handleFulfill,
    handleMarkFulfilled,
    handleSaveWishEdit,
    handleSupport,
    handleSupportConfirm,
    openWishEdit,
    setContactInfo,
    setEditWish,
    setEditWishText,
    setFulfillModalWish,
    setMarkFulfilledWish,
    setSelectedWish,
    setShowSupportConfirm,
    setSupportAmount,
    setSupportModalWish,
    setWishText,
  } = useGalaxyWishActions({
    user,
    userId,
    userK,
    refreshUser,
    toast,
    t,
    createdToday,
    setCreatedToday,
    fulfilledToday,
    setFulfilledToday,
    fulfilledThisMonth,
    setFulfilledThisMonth,
    setWishes,
  });

  const mineWishes = useMemo(() => wishes.filter(w => w.isMine), [wishes]);
  const otherWishes = useMemo(() => wishes.filter(w => !w.isMine && w.status !== 'fulfilled'), [wishes]);

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isLandscape && windowWidth >= 1024 ? 'lg:overflow-hidden' : 'overflow-y-auto'} text-slate-200 font-sans selection:bg-yellow-500/30`}>
      <GalaxySpaceOverlay />

      {/* Основной контейнер с рекламными блоками */}
      <div className="relative z-10 flex flex-1 min-h-0">
        {/* Левый рекламный блок - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="galaxy" placement="galaxy_sidebar_left" />

        {/* Центральный контент */}
        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">

          <GalaxyHeader
            createdToday={createdToday}
            fulfilledToday={fulfilledToday}
            isDesktop={isDesktop}
            localePath={localePath}
            t={t}
            userK={userK}
          />

          <p className="text-secondary text-neutral-400 leading-relaxed mb-4 shrink-0 text-center">
            {t('galaxy.subtitle')}
          </p>

          <GalaxyInfoCards isLandscape={isLandscape} t={t} />

          <GalaxyTabs
            activeTab={activeTab}
            layoutVersion={wishes.length}
            onTabChange={setActiveTab}
            t={t}
          />

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'create' ? (
              <GalaxyCreatePanel
                canCreate={canCreate}
                onCreate={handleCreate}
                onWishTextChange={setWishText}
                sending={sending}
                showSuccess={showSuccess}
                t={t}
                wishText={wishText}
              />
            ) : activeTab === 'mine' ? (
              <GalaxyWishList
                isLandscape={isLandscape}
                isWishEditable={isWishEditable}
                loadingMoreWishes={loadingMoreWishes}
                onEditWish={openWishEdit}
                onFulfillWish={setFulfillModalWish}
                onLoadMore={(scope) => void loadMoreWishes(scope)}
                onMarkFulfilled={setMarkFulfilledWish}
                onSelectWish={setSelectedWish}
                onSupportWish={setSupportModalWish}
                scope="mine"
                t={t}
                wishHasMore={wishHasMore.mine}
                wishes={mineWishes}
              />
            ) : (
              <GalaxyWishList
                isLandscape={isLandscape}
                isWishEditable={isWishEditable}
                loadingMoreWishes={loadingMoreWishes}
                onEditWish={openWishEdit}
                onFulfillWish={setFulfillModalWish}
                onLoadMore={(scope) => void loadMoreWishes(scope)}
                onMarkFulfilled={setMarkFulfilledWish}
                onSelectWish={setSelectedWish}
                onSupportWish={setSupportModalWish}
                scope="others"
                t={t}
                wishHasMore={wishHasMore.others}
                wishes={otherWishes}
              />
            )}
          </AnimatePresence>

          <GalaxyWishLaunchTrail launchId={launchId} />
        </div>

        {/* Правый рекламный блок - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="galaxy" placement="galaxy_sidebar_right" />
      </div>

      <GalaxyWishModals
        contactInfo={contactInfo}
        editWish={editWish}
        editWishText={editWishText}
        fulfillModalWish={fulfillModalWish}
        isSavingWishEdit={isSavingWishEdit}
        isWishEditable={isWishEditable}
        markFulfilledWish={markFulfilledWish}
        onCloseEditWish={() => setEditWish(null)}
        onCloseFulfillModal={() => setFulfillModalWish(null)}
        onCloseMarkFulfilled={() => setMarkFulfilledWish(null)}
        onCloseSelectedWish={() => setSelectedWish(null)}
        onCloseSupportConfirm={() => setShowSupportConfirm(false)}
        onCloseSupportModal={() => setSupportModalWish(null)}
        onContactInfoChange={setContactInfo}
        onEditWishTextChange={setEditWishText}
        onFulfill={handleFulfill}
        onMarkFulfilled={handleMarkFulfilled}
        onOpenWishEdit={openWishEdit}
        onSaveWishEdit={handleSaveWishEdit}
        onSupport={handleSupport}
        onSupportAmountChange={setSupportAmount}
        onSupportCancelAll={cancelSupport}
        onSupportConfirm={handleSupportConfirm}
        selectedWish={selectedWish}
        showSupportConfirm={showSupportConfirm}
        supportAmount={supportAmount}
        supportModalWish={supportModalWish}
        t={t}
        userK={userK}
      />

      <style jsx global>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 15s ease infinite;
        }
      `}</style>
    </div>
  );
}

