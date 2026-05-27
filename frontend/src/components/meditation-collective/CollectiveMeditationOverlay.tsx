'use client';

import dynamic from 'next/dynamic';
import { memo, type MouseEvent, type RefObject, type TouchEvent } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import type { CollectiveMeditationPhase } from '@/components/meditation/MeditationPlanetScene';
import type { SideAdSlot } from '@/utils/sideAdSlot';

const MeditationPlanetScene = dynamic(
  () => import('@/components/meditation/MeditationPlanetScene').then((m) => m.MeditationPlanetScene),
  { ssr: false }
);

const MemoMeditationPlanetScene = memo(MeditationPlanetScene);

type CollectiveMeditationOverlayProps = {
  isOpen: boolean;
  isActive: boolean;
  isLandscape: boolean;
  sideAdSlot: SideAdSlot | null;
  phase: CollectiveMeditationPhase;
  phaseTitle: string;
  phaseSubtitle: string | null;
  phaseTitleRef: RefObject<HTMLDivElement>;
  beamActive: boolean;
  beamOriginScreenY: number | null;
  onExit: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  t: (key: string) => string;
};

export function CollectiveMeditationOverlay({
  isOpen,
  isActive,
  isLandscape,
  sideAdSlot,
  phase,
  phaseTitle,
  phaseSubtitle,
  phaseTitleRef,
  beamActive,
  beamOriginScreenY,
  onExit,
  onHoldStart,
  onHoldEnd,
  t,
}: CollectiveMeditationOverlayProps) {
  if (!isOpen || !isActive) return null;

  const handleHoldStart = (event: MouseEvent | TouchEvent) => {
    if (phase !== 'give') return;
    event.preventDefault();
    onHoldStart();
  };

  const handleHoldEnd = (event?: MouseEvent | TouchEvent) => {
    if (phase !== 'give') return;
    event?.preventDefault();
    onHoldEnd();
  };

  return (
    <div
      className="fixed inset-0 z-[10050]"
      onMouseDown={handleHoldStart}
      onMouseUp={handleHoldEnd}
      onMouseLeave={() => onHoldEnd()}
      onTouchStart={handleHoldStart}
      onTouchEnd={handleHoldEnd}
      onTouchCancel={() => onHoldEnd()}
      onContextMenu={(event) => event.preventDefault()}
      onSelect={(event) => event.preventDefault()}
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <button
        type="button"
        onClick={onExit}
        className="absolute top-4 left-4 z-[110] px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest text-tiny border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25 active:scale-95 transition-all backdrop-blur-md"
      >
        {t('meditation_collective.exit')}
      </button>

      <div className="absolute inset-0 bg-[#02020a]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at top, rgba(34,211,238,0.06), rgba(2,2,10,0.95) 60%), url(/8k_stars_milky_way.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      </div>

      <div className="relative z-10 flex h-full w-full flex-col">
        {isLandscape ? (
          <div className="flex flex-1 min-h-0">
            <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_left" />

            <div className="flex flex-1 min-w-0 flex-col items-center justify-center gap-4 px-4 py-6">
              <div ref={phaseTitleRef} className="text-center text-xl sm:text-2xl md:text-3xl font-extrabold text-cyan-200 tracking-tight">
                {phaseTitle}
              </div>
              <div className="relative w-full flex-1 min-h-0">
                <MemoMeditationPlanetScene
                  phase={phase}
                  beamActive={beamActive}
                  beamOriginScreenY={beamOriginScreenY}
                />
              </div>
              {phaseSubtitle && (
                <div className="text-center text-secondary text-white/80">
                  {phaseSubtitle}
                </div>
              )}
            </div>

            <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_right" />
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col items-center gap-4 px-4 py-6">
            <div className="w-full flex justify-center">
              <AdaptiveAdWrapper
                page="practice_meditation"
                placement="practice_meditation_header"
                strategy="mobile_tablet_adaptive"
              />
            </div>
            <div className="relative w-full flex-1 min-h-0">
              <MemoMeditationPlanetScene
                phase={phase}
                beamActive={beamActive}
                beamOriginScreenY={beamOriginScreenY}
              />
            </div>
            <div className="text-center">
              <div ref={phaseTitleRef} className="text-xl sm:text-2xl font-extrabold text-cyan-200 tracking-tight">
                {phaseTitle}
              </div>
              {phaseSubtitle && (
                <div className="mt-1 text-secondary text-white/80">
                  {phaseSubtitle}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
