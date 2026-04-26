'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { BoostOffer, BoostPhase } from '@/types/boost';
import { BoostBanner } from '@/components/boost/BoostBanner';
import { BoostVideoModal } from '@/components/boost/BoostVideoModal';

type BoostContextValue = {
  offerBoost: (offer: Omit<BoostOffer, 'id'>) => void;
  phase: BoostPhase;
};

const BoostContext = createContext<BoostContextValue | undefined>(undefined);

const BANNER_DURATION_MS = 15_000;

export function BoostProvider({ children }: { children: React.ReactNode }) {
  const [currentOffer, setCurrentOffer] = useState<BoostOffer | null>(null);
  const [phase, setPhase] = useState<BoostPhase>('idle');
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBannerTimer = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  const dismissBanner = useCallback(() => {
    clearBannerTimer();
    setCurrentOffer(null);
    setPhase('idle');
  }, [clearBannerTimer]);

  const offerBoost = useCallback((offer: Omit<BoostOffer, 'id'>) => {
    clearBannerTimer();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const fullOffer: BoostOffer = { ...offer, id };
    setCurrentOffer(fullOffer);
    setPhase('banner');

    bannerTimerRef.current = setTimeout(() => {
      dismissBanner();
    }, BANNER_DURATION_MS);
  }, [clearBannerTimer, dismissBanner]);

  const handleWatch = useCallback(() => {
    clearBannerTimer();
    setPhase('video');
  }, [clearBannerTimer]);

  const handleVideoComplete = useCallback(() => {
    if (!currentOffer) return;
    setPhase('rewarded');
    currentOffer.onReward();
  }, [currentOffer]);

  const handleRewardDismiss = useCallback(() => {
    setCurrentOffer(null);
    setPhase('idle');
  }, []);

  const value = useMemo<BoostContextValue>(() => ({
    offerBoost,
    phase,
  }), [offerBoost, phase]);

  return (
    <BoostContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {phase === 'banner' && currentOffer && (
          <BoostBanner
            key={currentOffer.id}
            label={currentOffer.label}
            rewardText={currentOffer.rewardText}
            onWatch={handleWatch}
            onDismiss={dismissBanner}
          />
        )}
      </AnimatePresence>

      {phase === 'video' && (
        <BoostVideoModal
          onComplete={handleVideoComplete}
          onClose={dismissBanner}
        />
      )}

      <AnimatePresence>
        {phase === 'rewarded' && currentOffer && (
          <BoostBanner
            key={`reward_${currentOffer.id}`}
            label={currentOffer.rewardText}
            rewardText=""
            onWatch={() => {}}
            onDismiss={handleRewardDismiss}
            isReward
          />
        )}
      </AnimatePresence>
    </BoostContext.Provider>
  );
}

export function useBoost() {
  const ctx = useContext(BoostContext);
  if (!ctx) throw new Error('useBoost must be used within BoostProvider');
  return ctx;
}
