'use client';

import { useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { BridgeCreateModal } from '@/components/bridges/BridgeCreateModal';
import { BridgeDetailsModal } from '@/components/bridges/BridgeDetailsModal';
import { BridgeListPanel } from '@/components/bridges/BridgeListPanel';
import { BridgePageHeader } from '@/components/bridges/BridgePageHeader';
import { BridgeSidePanel } from '@/components/bridges/BridgeSidePanel';
import { BridgeSpaceOverlay } from '@/components/bridges/BridgeSpaceOverlay';
import { BridgeTabsBar } from '@/components/bridges/BridgeTabsBar';
import type { BridgeTab } from '@/components/bridges/types';
import { useBridgeCountryChoices } from '@/components/bridges/useBridgeCountryChoices';
import { useBridgeData } from '@/components/bridges/useBridgeData';
import { useBridgeDropdownClose } from '@/components/bridges/useBridgeDropdownClose';
import { useBridgeLayout } from '@/components/bridges/useBridgeLayout';
import { useBridgeMutations } from '@/components/bridges/useBridgeMutations';
import { useBridgeViewStats } from '@/components/bridges/useBridgeViewStats';
import { useI18n } from '@/context/I18nContext';

// --- MAIN COMPONENT ---
export default function BridgesPage() {
  const { user, refreshUser, updateUser } = useAuth();
  const toast = useToast();
  const { t, localePath } = useI18n();
  const [activeTab, setActiveTab] = useState<BridgeTab>('building');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFullDetailsModal, setShowFullDetailsModal] = useState(false);
  const [countryFrom, setCountryFrom] = useState('Russia');
  const [countryTo, setCountryTo] = useState('Belarus');
  const [isFromDropdownOpen, setIsFromDropdownOpen] = useState(false);
  const [isToDropdownOpen, setIsToDropdownOpen] = useState(false);
  const fromDropdownRef = useRef<HTMLDivElement>(null);
  const toDropdownRef = useRef<HTMLDivElement>(null);
  const { windowWidth, isLandscape, sideAdSlot, isDesktop } = useBridgeLayout();
  const userId = user?._id ? String(user._id) : '';
  const {
    bridges,
    setBridges,
    selectedBridge,
    setSelectedBridge,
    isLoading,
    isLoadingMore,
    page,
    hasMore,
    bridgeStats,
    paginationRef,
    pendingMutationsRef,
    persistBridgeStats,
    persistBridgeList,
    fetchBridgeStats,
    fetchBridges,
  } = useBridgeData({
    activeTab,
    userId,
  });
  const {
    availableToCountries,
    neighborsMap,
    selectedBridgeDistance,
  } = useBridgeCountryChoices({
    bridges,
    countryFrom,
    countryTo,
    onCountryToChange: setCountryTo,
  });

  useBridgeDropdownClose({
    fromDropdownRef,
    toDropdownRef,
    isFromDropdownOpen,
    isToDropdownOpen,
    setIsFromDropdownOpen,
    setIsToDropdownOpen,
  });

  const {
    totalStones,
    activeBridgesCount,
    builtBridgesCount,
    createdToday,
    stonesToday,
    newBridgeLimit,
    existingStoneLimit,
  } = useBridgeViewStats(bridges, bridgeStats);

  const {
    pendingBridgeIds,
    isCreatingBridge,
    handleLayStone,
    handleCreateBridge,
  } = useBridgeMutations({
    activeTab,
    bridges,
    selectedBridge,
    bridgeStats,
    createdToday,
    stonesToday,
    newBridgeLimit,
    existingStoneLimit,
    selectedBridgeDistance,
    countryFrom,
    countryTo,
    userId,
    user,
    refreshUser,
    updateUser,
    toast,
    t,
    setBridges,
    setSelectedBridge,
    setShowCreateModal,
    paginationRef,
    pendingMutationsRef,
    persistBridgeStats,
    persistBridgeList,
    fetchBridgeStats,
    fetchBridges,
  });

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isLandscape && windowWidth >= 1024 ? 'lg:overflow-hidden' : 'overflow-y-auto'} text-slate-200 font-sans selection:bg-yellow-500/30`}>
      <BridgeSpaceOverlay />

      {/* MAIN WRAPPER FOR CONTENT AND SIDE ADS */}
      <div className="relative z-10 flex flex-1 min-h-0">

        {/* LEFT AD BLOCK - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="bridges" placement="bridges_sidebar_left" />

        {/* MAIN CONTENT - NO SCROLL ON DESKTOP */}
        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">

          <BridgePageHeader
            t={t}
            localePath={localePath}
            isDesktop={isDesktop}
            userK={user?.k ?? 0}
            totalStones={totalStones}
            activeBridgesCount={activeBridgesCount}
            builtBridgesCount={builtBridgesCount}
          />

          <BridgeTabsBar
            activeTab={activeTab}
            isCreatingBridge={isCreatingBridge}
            createdToday={createdToday}
            newBridgeLimit={newBridgeLimit}
            t={t}
            setActiveTab={setActiveTab}
            onCreateClick={() => setShowCreateModal(true)}
          />

          {/* Main Content Grid - Vertical stack on tablets in portrait */}
          <div className={`grid gap-4 flex-1 min-h-0 ${isLandscape ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            <BridgeListPanel
              isLandscape={isLandscape}
              isLoading={isLoading}
              bridges={bridges}
              selectedBridgeId={selectedBridge?._id}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              t={t}
              onSelectBridge={setSelectedBridge}
              onLoadMore={() => void fetchBridges({ append: true, pageOverride: page + 1 })}
            />

            <BridgeSidePanel
              isLandscape={isLandscape}
              selectedBridge={selectedBridge}
              user={user}
              pendingBridgeIds={pendingBridgeIds}
              stonesToday={stonesToday}
              existingStoneLimit={existingStoneLimit}
              t={t}
              onClearSelected={() => setSelectedBridge(null)}
              onShowFullDetails={() => setShowFullDetailsModal(true)}
              onLayStone={handleLayStone}
            />
          </div>
        </div>

        {/* RIGHT AD BLOCK - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="bridges" placement="bridges_sidebar_right" />

      </div>

      {/* MODALS */}
      <AnimatePresence>
        {showCreateModal && (
          <BridgeCreateModal
            t={t}
            user={user}
            countryFrom={countryFrom}
            countryTo={countryTo}
            neighborsMap={neighborsMap}
            availableToCountries={availableToCountries}
            selectedBridgeDistance={selectedBridgeDistance}
            createdToday={createdToday}
            newBridgeLimit={newBridgeLimit}
            stonesToday={stonesToday}
            existingStoneLimit={existingStoneLimit}
            isCreatingBridge={isCreatingBridge}
            isFromDropdownOpen={isFromDropdownOpen}
            isToDropdownOpen={isToDropdownOpen}
            fromDropdownRef={fromDropdownRef}
            toDropdownRef={toDropdownRef}
            setCountryFrom={setCountryFrom}
            setCountryTo={setCountryTo}
            setIsFromDropdownOpen={setIsFromDropdownOpen}
            setIsToDropdownOpen={setIsToDropdownOpen}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateBridge}
          />
        )}

        {showFullDetailsModal && selectedBridge && (
          <BridgeDetailsModal
            selectedBridge={selectedBridge}
            t={t}
            onClose={() => setShowFullDetailsModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

