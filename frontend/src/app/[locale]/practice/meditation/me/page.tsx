'use client';

import { useEffect, useRef, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';
import {
    MEDITATION_EXHALE_DURATION_MS,
    MEDITATION_INHALE_DURATION_MS,
} from '@/components/meditation-me/constants';
import { MandalaRippleStyles } from '@/components/meditation-me/MandalaRippleStyles';
import { MeditationBreathingSurface } from '@/components/meditation-me/MeditationBreathingSurface';
import { MeditationMeBackground } from '@/components/meditation-me/MeditationMeBackground';
import { MeditationMeHeader } from '@/components/meditation-me/MeditationMeHeader';
import { useIndividualBreathingSession } from '@/components/meditation-me/useIndividualBreathingSession';

export default function MeditationMePage() {
    const { localePath, t } = useI18n();
    const [windowWidth, setWindowWidth] = useState(0);
    const [windowHeight, setWindowHeight] = useState(0);
    const [availableHeight, setAvailableHeight] = useState(0);
    const [isLandscape, setIsLandscape] = useState(false);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
    const hasSideAds = Boolean(sideAdSlot);
    const [instructionHeight, setInstructionHeight] = useState(0);
    const [cardWidth, setCardWidth] = useState(0);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const instructionRef = useRef<HTMLDivElement | null>(null);
    const instructionSecondaryRef = useRef<HTMLDivElement | null>(null);
    const inhaleDuration = MEDITATION_INHALE_DURATION_MS;
    const exhaleDuration = MEDITATION_EXHALE_DURATION_MS;
    const {
        isBreathing,
        startBreath,
        finishBreath,
        cancelBreath,
    } = useIndividualBreathingSession({ inhaleDuration });
    const breathTransition = `${isBreathing ? inhaleDuration : exhaleDuration}ms`;
    const safeWidth = windowWidth || 360;
    const safeHeight = windowHeight || 720;
    const isTouchDevice =
        typeof window !== 'undefined' &&
        (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
    const usePortraitLayout = !isLandscape || (isTouchDevice && safeWidth <= 1366);
    const isDesktop = safeWidth >= 1024 && !isTouchDevice;
    const isSplitHeader = safeWidth > 0 && (safeWidth < 768 || (isLandscape && safeWidth < 1024));
    const useSingleLineInstructions = isDesktop && safeWidth >= 1200;
    const minSide = Math.min(safeWidth, safeHeight);
    const outerGap = 8;
    const basePaddingY = Math.max(10, Math.min(32, Math.round(safeHeight * 0.035)));
    const basePaddingX = Math.max(12, Math.min(56, Math.round(safeWidth * 0.05)));
    const cardMaxWidth = Math.min(
        Math.round(safeWidth * (usePortraitLayout ? 0.96 : 0.92)),
        2000
    );
    const secondaryFontSize = Math.min(16, Math.max(12, 11.2 + safeWidth * 0.0025));
    const tinyFontSize = Math.min(14, Math.max(10, 9.6 + safeWidth * 0.00125));
    const instructionGap = Math.max(
        12,
        Math.min(
            isDesktop ? 32 : isTouchDevice ? 36 : 44,
            Math.round(minSide * (isDesktop ? 0.042 : isTouchDevice ? 0.045 : 0.055))
        )
    );
    const horizontalBarHeight = Math.max(8, Math.round(minSide * 0.018));
    const topInstructionLines = 1;
    const bottomInstructionLines = useSingleLineInstructions ? 1 : 2;
    const instructionLines = topInstructionLines + bottomInstructionLines;
    const instructionLineHeight = 1.625;
    const instructionSpacing = usePortraitLayout
        ? (instructionLines - 1) * 4
        : Math.max(0, bottomInstructionLines - 1) * 4;
    const estimatedInstructionHeight =
        secondaryFontSize * instructionLineHeight * instructionLines + instructionSpacing;
    const measuredInstructionHeight = instructionHeight || estimatedInstructionHeight;
    const estimatedLabelHeight = tinyFontSize * 1.6;
    const sliderLabelGap = 8;
    const portraitStackGap = usePortraitLayout
        ? Math.max(6, Math.round(instructionGap * 0.55))
        : 0;
    const estimatedSliderHeight = usePortraitLayout
        ? horizontalBarHeight + estimatedLabelHeight + sliderLabelGap
        : 0;
    const safetyMargin = isDesktop ? 16 : isTouchDevice ? 12 : 22;
    const layoutBuffer = 6;
    const blockBottomGap = outerGap;
    const effectiveAvailableHeight = Math.max(0, availableHeight - blockBottomGap);
    const contentPaddingY =
        effectiveAvailableHeight > 0
            ? Math.max(10, Math.min(basePaddingY, Math.round(effectiveAvailableHeight * (isDesktop ? 0.045 : 0.06))))
            : basePaddingY;
    const contentPaddingX = basePaddingX;
    const measuredCardWidth = cardWidth || cardMaxWidth;
    const contentWidth = Math.max(0, measuredCardWidth - contentPaddingX * 2);
    const instructionGapTotal = usePortraitLayout ? portraitStackGap * 2 : instructionGap * 2;
    const reservedHeight =
        measuredInstructionHeight +
        instructionGapTotal +
        contentPaddingY * 2 +
        (isDesktop ? 16 : 24) +
        safetyMargin +
        (usePortraitLayout ? estimatedSliderHeight + portraitStackGap : 0) +
        layoutBuffer;
    const portraitWidthBoundFactor = isTouchDevice ? 0.98 : 0.94;
    const portraitCardBoundFactor = isTouchDevice ? 1 : 0.98;
    const widthBound = Math.min(
        safeWidth * (usePortraitLayout ? portraitWidthBoundFactor : 0.78),
        cardMaxWidth * (usePortraitLayout ? portraitCardBoundFactor : 0.9)
    );
    const landscapeGapBase = isDesktop
        ? Math.max(32, Math.min(120, Math.round(minSide * 0.12)))
        : Math.max(20, Math.min(64, Math.round(minSide * 0.08)));
    const baseAvailableHeight = effectiveAvailableHeight > 0 ? effectiveAvailableHeight : safeHeight * 0.7;
    const maxMandalaHeight = Math.max(0, baseAvailableHeight - reservedHeight);
    const maxMandalaByScreen = Math.round(minSide * (usePortraitLayout ? (isTouchDevice ? 0.98 : 0.86) : 0.84));
    const sliderWidthMin = 14;
    const minMandalaSize = usePortraitLayout && isTouchDevice ? Math.round(widthBound * 0.78) : 0;
    let landscapeGap = usePortraitLayout ? 0 : landscapeGapBase;
    let mandalaSize = Math.max(minMandalaSize, Math.min(widthBound, maxMandalaHeight, maxMandalaByScreen));
    let sliderWidth = Math.max(sliderWidthMin, Math.round(mandalaSize * 0.05));

    if (!usePortraitLayout) {
        const maxLandscapeGap = Math.max(0, Math.floor((contentWidth - mandalaSize - sliderWidth * 2) / 2));
        landscapeGap = Math.min(landscapeGapBase, maxLandscapeGap);
        const maxMandalaByLandscapeWidth = Math.max(0, contentWidth - sliderWidth * 2 - landscapeGap * 2);
        mandalaSize = Math.max(0, Math.min(widthBound, maxMandalaHeight, maxMandalaByScreen, maxMandalaByLandscapeWidth));
        sliderWidth = Math.max(sliderWidthMin, Math.round(mandalaSize * 0.05));
        const maxLandscapeGap2 = Math.max(0, Math.floor((contentWidth - mandalaSize - sliderWidth * 2) / 2));
        landscapeGap = Math.min(landscapeGapBase, maxLandscapeGap2);
    }

    const sliderBaseHeight = Math.max(60, Math.round(mandalaSize * 0.45));
    const sliderHeightCap = Math.max(0, mandalaSize - estimatedLabelHeight - 6);
    const sliderHeight = sliderHeightCap > 0 ? Math.min(sliderBaseHeight, sliderHeightCap) : sliderBaseHeight;
    const maxBarWidth = contentWidth;
    const horizontalBarWidth = Math.min(
        maxBarWidth,
        Math.max(200, Math.round(mandalaSize * 1.1))
    );
    const instructionMaxWidth = Math.min(
        cardMaxWidth - contentPaddingX * 2,
        Math.max(
            isDesktop ? 520 : 240,
            Math.round(widthBound * (usePortraitLayout ? 0.95 : 1.1))
        )
    );

    useEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setWindowWidth(w);
            setWindowHeight(h);
            setIsLandscape(w > h);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    useEffect(() => {
        const element = cardRef.current;
        if (!element) return;

        const updateWidth = () => {
            const width = Math.round(element.getBoundingClientRect().width);
            setCardWidth((prev) => (prev === width ? prev : width));
        };

        updateWidth();

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(updateWidth);
            observer.observe(element);
        }

        window.addEventListener('resize', updateWidth);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    useEffect(() => {
        const primary = instructionRef.current;
        const secondary = instructionSecondaryRef.current;
        if (!primary && !secondary) return;

        const updateHeight = () => {
            const primaryHeight = primary ? Math.round(primary.getBoundingClientRect().height) : 0;
            const secondaryHeight = secondary ? Math.round(secondary.getBoundingClientRect().height) : 0;
            const height = primaryHeight + secondaryHeight;
            setInstructionHeight((prev) => (prev === height ? prev : height));
        };

        updateHeight();

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(updateHeight);
            if (primary) observer.observe(primary);
            if (secondary) observer.observe(secondary);
        }

        window.addEventListener('resize', updateHeight);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

    useEffect(() => {
        const element = contentRef.current;
        if (!element) return;

        const updateAvailable = () => {
            const height = Math.round(element.getBoundingClientRect().height);
            setAvailableHeight((prev) => (prev === height ? prev : height));
        };

        updateAvailable();

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(updateAvailable);
            observer.observe(element);
        }

        window.addEventListener('resize', updateAvailable);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', updateAvailable);
        };
    }, []);

    useEffect(() => {
        const prevent = (event: Event) => event.preventDefault();

        document.addEventListener('copy', prevent);
        document.addEventListener('cut', prevent);
        document.addEventListener('contextmenu', prevent);
        document.addEventListener('selectstart', prevent);

        return () => {
            document.removeEventListener('copy', prevent);
            document.removeEventListener('cut', prevent);
            document.removeEventListener('contextmenu', prevent);
            document.removeEventListener('selectstart', prevent);
        };
    }, []);

    return (
        <div
            className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-cyan-500/30`}
            onContextMenu={(event) => event.preventDefault()}
            onSelect={(event) => event.preventDefault()}
            style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        >
            <MeditationMeBackground />

            <div className="relative z-10 flex flex-1 min-h-0">
                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_left" />

                <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
                    <div className={`${hasSideAds ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
                        <AdaptiveAdWrapper
                            page="practice_meditation"
                            placement="practice_meditation_header"
                            strategy="mobile_tablet_adaptive"
                        />
                    </div>

                    <MeditationMeHeader
                        practiceHref={localePath('/practice')}
                        collectiveHref={localePath('/practice/meditation/we')}
                        isSplitHeader={isSplitHeader}
                        t={t}
                    />

                    <div ref={contentRef} className="flex-1 min-h-0 flex items-stretch justify-center overflow-x-hidden overflow-y-auto no-scrollbar pb-2">
                        <div
                            ref={cardRef}
                            className="w-full h-full mx-auto"
                            style={{ maxWidth: cardMaxWidth, padding: `${contentPaddingY}px ${contentPaddingX}px` }}
                        >
                            <div className="flex h-full flex-col items-center justify-center" style={{ gap: instructionGap }}>
                                <MeditationBreathingSurface
                                    usePortraitLayout={usePortraitLayout}
                                    portraitStackGap={portraitStackGap}
                                    horizontalBarWidth={horizontalBarWidth}
                                    horizontalBarHeight={horizontalBarHeight}
                                    mandalaSize={mandalaSize}
                                    isBreathing={isBreathing}
                                    breathTransition={breathTransition}
                                    instructionMaxWidth={instructionMaxWidth}
                                    useSingleLineInstructions={useSingleLineInstructions}
                                    landscapeGap={landscapeGap}
                                    sliderHeight={sliderHeight}
                                    sliderWidth={sliderWidth}
                                    instructionRef={instructionRef}
                                    instructionSecondaryRef={instructionSecondaryRef}
                                    onBreathStart={startBreath}
                                    onBreathEnd={finishBreath}
                                    onBreathCancel={cancelBreath}
                                    t={t}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_right" />
            </div>
            <MandalaRippleStyles />
        </div>
    );
}
