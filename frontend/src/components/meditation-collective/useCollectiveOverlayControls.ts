'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { CollectiveMeditationPhase } from '@/components/meditation/MeditationPlanetScene';

type UseCollectiveOverlayControlsOptions = {
  isOpen: boolean;
  isActive: boolean;
  isCompactLayout: boolean;
  phase: CollectiveMeditationPhase;
  phaseTitle: string;
  phaseTitleRef: RefObject<HTMLDivElement>;
  windowHeight: number;
  windowWidth: number;
  isLandscape: boolean;
};

export function useCollectiveOverlayControls({
  isOpen,
  isActive,
  isCompactLayout,
  phase,
  phaseTitle,
  phaseTitleRef,
  windowHeight,
  windowWidth,
  isLandscape,
}: UseCollectiveOverlayControlsOptions) {
  const [collectiveHold, setCollectiveHold] = useState(false);
  const [beamOriginScreenY, setBeamOriginScreenY] = useState<number | null>(null);

  const startCollectiveHold = useCallback(() => {
    setCollectiveHold(true);
  }, []);

  const endCollectiveHold = useCallback(() => {
    setCollectiveHold(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !isCompactLayout) {
      setBeamOriginScreenY(null);
      return;
    }

    const node = phaseTitleRef.current;
    if (!node) {
      setBeamOriginScreenY(null);
      return;
    }

    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const viewportHeight = windowHeight || window.innerHeight;
      const origin = rect.bottom + 50;
      const clamped = Math.min(Math.max(origin, 0), Math.max(0, viewportHeight - 20));
      setBeamOriginScreenY(clamped);
    });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [isOpen, isCompactLayout, phaseTitle, phaseTitleRef, windowHeight, windowWidth, isLandscape]);

  useEffect(() => {
    if (phase === 'absorb') {
      endCollectiveHold();
    }
  }, [endCollectiveHold, phase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOpen || !isActive) return;

    const isSpaceKey = (event: KeyboardEvent) =>
      event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpaceKey(event)) return;
      if (event.repeat) return;
      if (phase !== 'give') return;
      event.preventDefault();
      startCollectiveHold();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isSpaceKey(event)) return;
      if (phase !== 'give') return;
      event.preventDefault();
      endCollectiveHold();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (phase !== 'give') return;
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      startCollectiveHold();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (phase !== 'give') return;
      event.preventDefault();
      endCollectiveHold();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handlePointerDown, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', handlePointerUp, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [endCollectiveHold, isActive, isOpen, phase, startCollectiveHold]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return {
    collectiveHold,
    beamOriginScreenY,
    startCollectiveHold,
    endCollectiveHold,
  };
}
