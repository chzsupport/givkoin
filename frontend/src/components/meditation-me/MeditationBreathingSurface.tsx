'use client';

import type { RefObject } from 'react';
import Image from 'next/image';

type TFunction = (key: string) => string;

type MeditationBreathingSurfaceProps = {
  usePortraitLayout: boolean;
  portraitStackGap: number;
  horizontalBarWidth: number;
  horizontalBarHeight: number;
  mandalaSize: number;
  isBreathing: boolean;
  breathTransition: string;
  instructionMaxWidth: number;
  useSingleLineInstructions: boolean;
  landscapeGap: number;
  sliderHeight: number;
  sliderWidth: number;
  instructionRef: RefObject<HTMLDivElement>;
  instructionSecondaryRef: RefObject<HTMLDivElement>;
  onBreathStart: () => void;
  onBreathEnd: () => void;
  onBreathCancel: () => void;
  t: TFunction;
};

function BreathLabel({ children }: { children: string }) {
  return (
    <span className="uppercase tracking-[0.35em] text-white/40 text-tiny">
      {children}
    </span>
  );
}

function BreathInstructions({
  useSingleLineInstructions,
  t,
}: {
  useSingleLineInstructions: boolean;
  t: TFunction;
}) {
  if (useSingleLineInstructions) {
    return <p>{t('practice.inhale_space')}</p>;
  }

  return (
    <>
      <p>{t('practice.inhale_space_only')}</p>
      <p>{t('practice.exhale_release')}</p>
    </>
  );
}

function MandalaCore({
  mandalaSize,
  isBreathing,
  breathTransition,
  t,
}: {
  mandalaSize: number;
  isBreathing: boolean;
  breathTransition: string;
  t: TFunction;
}) {
  return (
    <div
      className="relative flex items-center justify-center overflow-visible"
      style={{ width: mandalaSize, height: mandalaSize }}
    >
      {isBreathing && (
        <>
          <span className="mandala-ripple mandala-ripple--one" />
          <span className="mandala-ripple mandala-ripple--two" />
        </>
      )}
      <Image
        src="/mandala.jpeg"
        alt={t('meditation_me.mandala_alt')}
        fill
        sizes="256px"
        className="relative z-10 rounded-full transition-[filter,box-shadow] ease-linear object-cover"
        style={{
          transitionDuration: breathTransition,
          filter: isBreathing ? 'brightness(1.08) saturate(1.05)' : 'brightness(1) saturate(1)',
          boxShadow: isBreathing
            ? '0 0 70px rgba(56,189,248,0.38)'
            : '0 0 40px rgba(56,189,248,0.18)',
        }}
      />
    </div>
  );
}

function HorizontalBreathBar({
  width,
  height,
  isBreathing,
  breathTransition,
}: {
  width: number;
  height: number;
  isBreathing: boolean;
  breathTransition: string;
}) {
  return (
    <div
      className="relative rounded-full border border-white/15 bg-white/5 overflow-hidden"
      style={{ width, height }}
    >
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-200 transition-transform ease-linear origin-center"
        style={{
          transform: isBreathing ? 'scaleX(1)' : 'scaleX(0)',
          transitionDuration: breathTransition,
        }}
      />
    </div>
  );
}

function VerticalBreathBar({
  height,
  width,
  isBreathing,
  breathTransition,
}: {
  height: number;
  width: number;
  isBreathing: boolean;
  breathTransition: string;
}) {
  return (
    <div
      className="relative rounded-full border border-white/15 bg-white/5 overflow-hidden"
      style={{ height, width }}
    >
      <div
        className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-cyan-400 via-cyan-300 to-emerald-200 transition-[height] ease-linear"
        style={{
          height: isBreathing ? '100%' : '0%',
          transitionDuration: breathTransition,
        }}
      />
    </div>
  );
}

export function MeditationBreathingSurface({
  usePortraitLayout,
  portraitStackGap,
  horizontalBarWidth,
  horizontalBarHeight,
  mandalaSize,
  isBreathing,
  breathTransition,
  instructionMaxWidth,
  useSingleLineInstructions,
  landscapeGap,
  sliderHeight,
  sliderWidth,
  instructionRef,
  instructionSecondaryRef,
  onBreathStart,
  onBreathEnd,
  onBreathCancel,
  t,
}: MeditationBreathingSurfaceProps) {
  return (
    <>
      {!usePortraitLayout && (
        <div
          ref={instructionRef}
          className="text-center leading-relaxed text-white/70 text-secondary"
          style={{ maxWidth: instructionMaxWidth }}
        >
          <p className="text-white/90 font-semibold">{t('practice.look_center')}</p>
        </div>
      )}

      <div
        className="w-full select-none"
        onMouseDown={(event) => {
          event.preventDefault();
          onBreathStart();
        }}
        onMouseUp={(event) => {
          event.preventDefault();
          onBreathEnd();
        }}
        onMouseLeave={onBreathCancel}
        onTouchStart={(event) => {
          event.preventDefault();
          onBreathStart();
        }}
        onTouchEnd={(event) => {
          event.preventDefault();
          onBreathEnd();
        }}
        onTouchCancel={onBreathCancel}
        style={{ touchAction: 'none' }}
      >
        {usePortraitLayout ? (
          <div className="flex flex-col items-center" style={{ gap: portraitStackGap }}>
            <div className="flex flex-col items-center gap-2">
              <HorizontalBreathBar
                width={horizontalBarWidth}
                height={horizontalBarHeight}
                isBreathing={isBreathing}
                breathTransition={breathTransition}
              />
              <BreathLabel>{t('meditation_me.inhale')}</BreathLabel>
            </div>
            <div className="flex flex-col items-center gap-2">
              <MandalaCore
                mandalaSize={mandalaSize}
                isBreathing={isBreathing}
                breathTransition={breathTransition}
                t={t}
              />
            </div>
            <div
              ref={instructionRef}
              className="text-center leading-relaxed text-white/70 text-secondary space-y-1"
              style={{ maxWidth: instructionMaxWidth }}
            >
              <p className="text-white/90 font-semibold">{t('practice.look_center')}</p>
              <BreathInstructions useSingleLineInstructions={useSingleLineInstructions} t={t} />
            </div>
          </div>
        ) : (
          <div
            className="grid w-full grid-cols-[auto_auto_auto] items-center justify-center"
            style={{ columnGap: landscapeGap }}
          >
            <div className="flex flex-col items-center gap-2 justify-self-end">
              <VerticalBreathBar
                height={sliderHeight}
                width={sliderWidth}
                isBreathing={isBreathing}
                breathTransition={breathTransition}
              />
              <BreathLabel>{t('meditation_me.inhale')}</BreathLabel>
            </div>
            <div className="flex flex-col items-center gap-2 justify-self-center">
              <MandalaCore
                mandalaSize={mandalaSize}
                isBreathing={isBreathing}
                breathTransition={breathTransition}
                t={t}
              />
            </div>

            <div aria-hidden style={{ width: sliderWidth }} />
          </div>
        )}
      </div>

      {!usePortraitLayout && (
        <div
          ref={instructionSecondaryRef}
          className="text-center leading-relaxed text-white/70 space-y-1 text-secondary"
          style={{ maxWidth: instructionMaxWidth }}
        >
          <BreathInstructions useSingleLineInstructions={useSingleLineInstructions} t={t} />
        </div>
      )}
    </>
  );
}
