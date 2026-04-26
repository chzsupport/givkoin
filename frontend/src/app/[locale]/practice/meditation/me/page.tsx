'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { Sparkles } from 'lucide-react';
import { apiPost, apiPostKeepalive } from '@/utils/api';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

export default function MeditationMePage() {
    const { localePath, t } = useI18n();
    const [windowWidth, setWindowWidth] = useState(0);
    const [windowHeight, setWindowHeight] = useState(0);
    const [availableHeight, setAvailableHeight] = useState(0);
    const [isLandscape, setIsLandscape] = useState(false);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
    const hasSideAds = Boolean(sideAdSlot);
    const [isBreathing, setIsBreathing] = useState(false);
    const inhaleStartedAtRef = useRef<number | null>(null);
    const clientSessionIdRef = useRef<string>('');
    const completedBreathsRef = useRef(0);
    const settledBreathsRef = useRef(0);
    const isSettlingRef = useRef(false);
    const [instructionHeight, setInstructionHeight] = useState(0);
    const [cardWidth, setCardWidth] = useState(0);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const instructionRef = useRef<HTMLDivElement | null>(null);
    const instructionSecondaryRef = useRef<HTMLDivElement | null>(null);
    const inhaleDuration = 4000;
    const exhaleDuration = 2500;
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

    const flushBreaths = useCallback(async (useKeepalive = false) => {
        if (!clientSessionIdRef.current) return;
        if (completedBreathsRef.current <= settledBreathsRef.current) return;
        if (isSettlingRef.current) return;

        const payload = {
            clientSessionId: clientSessionIdRef.current,
            completedBreaths: completedBreathsRef.current,
        };

        if (useKeepalive) {
            apiPostKeepalive('/meditation/individual/settle', payload);
            settledBreathsRef.current = completedBreathsRef.current;
            return;
        }

        isSettlingRef.current = true;
        try {
            await apiPost('/meditation/individual/settle', payload);
            settledBreathsRef.current = completedBreathsRef.current;
        } catch {
            // ignore
        } finally {
            isSettlingRef.current = false;
        }
    }, []);

    const recordCompletedBreath = useCallback(() => {
        completedBreathsRef.current += 1;
        const unsent = completedBreathsRef.current - settledBreathsRef.current;
        if (unsent >= 10) {
            void flushBreaths(false);
        }
    }, [flushBreaths]);

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
        clientSessionIdRef.current =
            typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function'
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space' && event.key !== ' ') return;
            if (event.repeat) return;
            event.preventDefault();
            inhaleStartedAtRef.current = Date.now();
            setIsBreathing(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code !== 'Space' && event.key !== ' ') return;
            event.preventDefault();
            const startedAt = inhaleStartedAtRef.current;
            inhaleStartedAtRef.current = null;
            if (startedAt && Date.now() - startedAt >= inhaleDuration) {
                recordCompletedBreath();
            }
            setIsBreathing(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [inhaleDuration, recordCompletedBreath]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                void flushBreaths(true);
            }
        };

        const handlePageHide = () => {
            void flushBreaths(true);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            void flushBreaths(false);
        };
    }, [flushBreaths]);

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
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#050510] to-[#050510]" />
                <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
            </div>

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

                    <header className={`mb-2 flex-shrink-0 flex flex-col gap-3 ${isSplitHeader ? '' : 'sm:gap-4'}`}>
                        <div className="flex items-center gap-2 w-full">
                            <Link
                                href={localePath('/practice')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                            >
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('meditation_collective.to_practice')}
                            </Link>

                            <div className="flex flex-1 justify-center">
                                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
                                    <span
                                        className="px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest bg-cyan-500/25 text-cyan-100 border border-cyan-400/30"
                                    >
                                        {t('meditation_collective.tab_me')}
                                    </span>
                                    <Link
                                        href={localePath('/practice/meditation/we')}
                                        className="px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest transition-all text-white/55 hover:text-white/80"
                                    >
                                        {t('meditation_collective.tab_we')}
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <PageTitle
                            title={t('meditation_collective.page_title')}
                            Icon={Sparkles}
                            gradientClassName="from-cyan-200 via-cyan-400 to-blue-500"
                            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
                            className="w-fit mx-auto"
                        />
                    </header>

                    <div ref={contentRef} className="flex-1 min-h-0 flex items-stretch justify-center overflow-x-hidden overflow-y-auto no-scrollbar pb-2">
                        <div
                            ref={cardRef}
                            className="w-full h-full mx-auto"
                            style={{ maxWidth: cardMaxWidth, padding: `${contentPaddingY}px ${contentPaddingX}px` }}
                        >
                            <div className="flex h-full flex-col items-center justify-center" style={{ gap: instructionGap }}>
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
                                        inhaleStartedAtRef.current = Date.now();
                                        setIsBreathing(true);
                                    }}
                                    onMouseUp={(event) => {
                                        event.preventDefault();
                                        const startedAt = inhaleStartedAtRef.current;
                                        inhaleStartedAtRef.current = null;
                                        if (startedAt && Date.now() - startedAt >= inhaleDuration) {
                                            recordCompletedBreath();
                                        }
                                        setIsBreathing(false);
                                    }}
                                    onMouseLeave={() => {
                                        inhaleStartedAtRef.current = null;
                                        setIsBreathing(false);
                                    }}
                                    onTouchStart={(event) => {
                                        event.preventDefault();
                                        inhaleStartedAtRef.current = Date.now();
                                        setIsBreathing(true);
                                    }}
                                    onTouchEnd={(event) => {
                                        event.preventDefault();
                                        const startedAt = inhaleStartedAtRef.current;
                                        inhaleStartedAtRef.current = null;
                                        if (startedAt && Date.now() - startedAt >= inhaleDuration) {
                                            recordCompletedBreath();
                                        }
                                        setIsBreathing(false);
                                    }}
                                    onTouchCancel={() => {
                                        inhaleStartedAtRef.current = null;
                                        setIsBreathing(false);
                                    }}
                                    style={{ touchAction: 'none' }}
                                >
                                    {usePortraitLayout ? (
                                        <div className="flex flex-col items-center" style={{ gap: portraitStackGap }}>
                                            <div className="flex flex-col items-center gap-2">
                                                <div
                                                    className="relative rounded-full border border-white/15 bg-white/5 overflow-hidden"
                                                    style={{ width: horizontalBarWidth, height: horizontalBarHeight }}
                                                >
                                                    <div
                                                        className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-200 transition-transform ease-linear origin-center"
                                                        style={{
                                                            transform: isBreathing ? 'scaleX(1)' : 'scaleX(0)',
                                                            transitionDuration: breathTransition,
                                                        }}
                                                    />
                                                </div>
                                                <span className="uppercase tracking-[0.35em] text-white/40 text-tiny">
                                                    {t('meditation_me.inhale')}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-center gap-2">
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
                                            </div>
                                            <div
                                                ref={instructionRef}
                                                className="text-center leading-relaxed text-white/70 text-secondary space-y-1"
                                                style={{ maxWidth: instructionMaxWidth }}
                                            >
                                                <p className="text-white/90 font-semibold">{t('practice.look_center')}</p>
                                                {useSingleLineInstructions ? (
                                                    <p>{t('practice.inhale_space')}</p>
                                                ) : (
                                                    <>
                                                        <p>{t('practice.inhale_space_only')}</p>
                                                        <p>{t('practice.exhale_release')}</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="grid w-full grid-cols-[auto_auto_auto] items-center justify-center"
                                            style={{ columnGap: landscapeGap }}
                                        >
                                            <div className="flex flex-col items-center gap-2 justify-self-end">
                                                <div
                                                    className="relative rounded-full border border-white/15 bg-white/5 overflow-hidden"
                                                    style={{ height: sliderHeight, width: sliderWidth }}
                                                >
                                                    <div
                                                        className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-cyan-400 via-cyan-300 to-emerald-200 transition-[height] ease-linear"
                                                        style={{
                                                            height: isBreathing ? '100%' : '0%',
                                                            transitionDuration: breathTransition,
                                                        }}
                                                    />
                                                </div>
                                                <span className="uppercase tracking-[0.35em] text-white/40 text-tiny">
                                                    {t('meditation_me.inhale')}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-center gap-2 justify-self-center">
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
                                        {useSingleLineInstructions ? (
                                            <p>{t('practice.inhale_space')}</p>
                                        ) : (
                                            <>
                                                <p>{t('practice.inhale_space_only')}</p>
                                                <p>{t('practice.exhale_release')}</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_right" />
            </div>
            <style jsx>{`
        @keyframes mandala-ripple {
          0% {
            transform: scale(1);
            opacity: 0.35;
          }
          70% {
            opacity: 0.15;
          }
          100% {
            transform: scale(1.35);
            opacity: 0;
          }
        }

        .mandala-ripple {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 0 35px rgba(56, 189, 248, 0.25);
          animation: mandala-ripple 2.4s ease-out infinite;
          pointer-events: none;
          will-change: transform, opacity;
        }

        .mandala-ripple--two {
          animation-delay: 1.2s;
        }
      `}</style>
        </div>
    );
}
