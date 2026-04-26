'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Merriweather } from 'next/font/google';
import type { BattleSummary } from '@/lib/battleSummary';
import { getAchievementCatalogItem } from '@/lib/achievementCatalog';
import { useI18n } from '@/context/I18nContext';

type BattleSummaryOverlayProps = {
    isOpen: boolean;
    summary: BattleSummary | null;
    loading?: boolean;
    playAnimation?: boolean;
    onClose: () => void;
    onPrimaryAction: () => void;
    primaryActionLabel: string;
    onSecondaryAction?: (() => void) | null;
    secondaryActionLabel?: string | null;
};

const parchmentSerif = Merriweather({
    subsets: ['latin', 'cyrillic'],
    weight: ['400', '700'],
    display: 'swap',
});

const INTRO_TYPE_DELAY_MS = 334;
const INTRO_TYPE_STEP = 3;
const LINE_REVEAL_DELAY_MS = 850;
const LINE_LABEL_TYPE_DELAY_MS = 52;
const LINE_LABEL_TYPE_STEP = 4;

const DISPLAY_LINE_ORDER = [
    'user_damage',
    'reward_sc',
    'duration',
    'best_player',
    'achievements',
    'total_dark_damage',
    'total_light_damage',
] as const;

const RESULT_LABEL_KEYS: Record<NonNullable<BattleSummary['result']>, 'battle_summary.result_victory' | 'battle_summary.result_defeat' | 'battle_summary.result_draw'> = {
    light: 'battle_summary.result_victory',
    dark: 'battle_summary.result_defeat',
    draw: 'battle_summary.result_draw',
};

function TypingText({
    text,
    delayMs,
    step,
    instant = false,
    showCaret = false,
    className = '',
}: {
    text: string;
    delayMs: number;
    step: number;
    instant?: boolean;
    showCaret?: boolean;
    className?: string;
}) {
    const [visibleChars, setVisibleChars] = useState(instant ? text.length : 0);

    useEffect(() => {
        if (instant) {
            setVisibleChars(text.length);
            return;
        }

        setVisibleChars(0);
        let cancelled = false;
        let timer = 0;

        const tick = (nextValue: number) => {
            if (cancelled) return;
            const bounded = Math.min(text.length, nextValue);
            setVisibleChars(bounded);
            if (bounded >= text.length) {
                return;
            }
            timer = window.setTimeout(() => tick(bounded + step), delayMs);
        };

        tick(step);

        return () => {
            cancelled = true;
            if (timer) {
                window.clearTimeout(timer);
            }
        };
    }, [delayMs, instant, step, text]);

    const displayText = text.slice(0, visibleChars);
    const showBlinkingCaret = showCaret && visibleChars < text.length;

    return (
        <span className={className}>
            {displayText}
            {showBlinkingCaret ? <span className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse bg-[#c79d4a] align-[-0.16em]" /> : null}
        </span>
    );
}

function getOrderedLines(summary: BattleSummary | null) {
    if (!summary) return [];
    const linesByKey = new Map(summary.lines.map((line) => [line.key, line]));
    return DISPLAY_LINE_ORDER
        .map((key) => linesByKey.get(key))
        .filter((line): line is BattleSummary['lines'][number] => Boolean(line));
}

function getLineLabel(_summary: BattleSummary | null, line: BattleSummary['lines'][number]) {
    return line.label;
}

function getFinalTreeNote(summary: BattleSummary | null, loading: boolean, t: (key: string) => string) {
    if (!summary) return null;

    const injuryLine = summary.lines.find((line) => line.key === 'injury') || null;
    if (loading || (injuryLine && injuryLine.state !== 'ready')) {
        return t('battle_summary.tree_note_pending');
    }

    if (summary.injury?.branchName) {
        return t('battle_summary.tree_note_injury');
    }

    return t('battle_summary.tree_note_no_injury');
}

function formatIntroText(text: string, marker: string) {
    if (!text) return text;

    if (marker && text.includes(marker)) {
        return text.replace(marker, `\n\n${marker.trimStart()}`);
    }

    return text;
}

function renderPendingValue(lineIndex: number, t: (key: string) => string) {
    return (
        <div className="inline-flex items-center justify-end gap-2 text-sm text-[#7a5b34]">
            <span>{lineIndex >= 4 ? t('battle_summary.pending_ink_dry') : t('battle_summary.pending_line_printing')}</span>
            <span className="inline-flex gap-1">
                <span className="h-2 w-2 rounded-full bg-[#8c5b28] animate-pulse" />
                <span className="h-2 w-2 rounded-full bg-[#8c5b28]/80 animate-pulse [animation-delay:140ms]" />
                <span className="h-2 w-2 rounded-full bg-[#8c5b28]/60 animate-pulse [animation-delay:280ms]" />
            </span>
        </div>
    );
}

function renderLineValue(
    summary: BattleSummary | null,
    lineIndex: number,
    line: BattleSummary['lines'][number],
    t: (key: string) => string,
    language: string,
) {
    if (line.key === 'achievements') {
        if (line.state === 'error') {
            return <div className="text-right text-sm font-semibold text-[#c98d63]">{line.errorText || t('battle_summary.achievements_closed')}</div>;
        }

        if (line.state !== 'ready') {
            return renderPendingValue(lineIndex, t);
        }

        const achievementCards = (summary?.awardedAchievements || [])
            .map((achievementId) => getAchievementCatalogItem(achievementId, language))
            .filter((achievement): achievement is NonNullable<ReturnType<typeof getAchievementCatalogItem>> => Boolean(achievement));

        if (!achievementCards.length) {
            return <div className="text-right text-lg font-semibold text-[#e2c27a]">{t('battle_summary.achievements_none')}</div>;
        }

        return (
            <div className="flex flex-wrap justify-end gap-3">
                {achievementCards.map((achievement) => (
                    <div
                        key={achievement.id}
                        className="flex min-w-[172px] max-w-[220px] items-center gap-3 rounded-[22px] border border-[#8a6433]/40 bg-[linear-gradient(180deg,rgba(77,49,22,0.94)_0%,rgba(61,39,18,0.96)_100%)] px-3 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.26)]"
                    >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px] border border-[#9c7640]/40 bg-[#7a5a2d]">
                            <Image
                                src={achievement.imageSrc}
                                alt={achievement.title}
                                width={56}
                                height={56}
                                className="h-full w-full object-cover"
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="text-base font-semibold leading-tight text-[#f0d38d]">
                                {achievement.title}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (line.state === 'error') {
        return (
            <div className="text-right text-sm font-semibold text-[#c98d63]">
                {line.errorText || t('battle_summary.line_not_written')}
            </div>
        );
    }

    if (line.state !== 'ready') {
        return renderPendingValue(lineIndex, t);
    }

    return (
        <div className="text-right text-xl font-semibold leading-snug text-[#f0d38d] md:text-2xl">
            {line.valueText || t('battle_summary.value_dash')}
        </div>
    );
}

function SummaryLineCard({
    summary,
    line,
    lineIndex,
    instant,
    t,
    language,
}: {
    summary: BattleSummary | null;
    line: BattleSummary['lines'][number];
    lineIndex: number;
    instant: boolean;
    t: (key: string) => string;
    language: string;
}) {
    const label = getLineLabel(summary, line);
    const achievementsLine = line.key === 'achievements';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-[26px] border border-[#8d6839]/38 bg-[linear-gradient(180deg,rgba(96,66,34,0.96)_0%,rgba(74,49,24,0.97)_52%,rgba(56,37,18,0.98)_100%)] px-4 py-4 shadow-[0_16px_42px_rgba(0,0,0,0.28)]"
        >
            <div className="absolute inset-x-0 top-0 h-[1px] bg-[#dfbf82]/60" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(212,181,109,0.14)_0%,rgba(212,181,109,0)_22%),radial-gradient(circle_at_82%_78%,rgba(31,18,8,0.22)_0%,rgba(31,18,8,0)_28%),radial-gradient(circle_at_52%_42%,rgba(150,112,56,0.12)_0%,rgba(150,112,56,0)_36%)] mix-blend-screen" />
            <div className={`grid gap-4 ${achievementsLine ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] md:items-start'}`}>
                <div className="min-w-0">
                    <div className="text-[1.15rem] leading-snug text-[#dcc18a] md:text-[1.35rem]">
                        <TypingText
                            text={label}
                            delayMs={LINE_LABEL_TYPE_DELAY_MS}
                            step={LINE_LABEL_TYPE_STEP}
                            instant={instant}
                            className={parchmentSerif.className}
                        />
                    </div>
                </div>
                <div className={`${achievementsLine ? 'pt-1' : 'self-center'}`}>
                    {renderLineValue(summary, lineIndex, line, t, language)}
                </div>
            </div>
        </motion.div>
    );
}

function ResultWord({ result, t }: { result: BattleSummary['result']; t: (key: string) => string }) {
    if (!result) return null;

    const colorClass = result === 'light'
        ? 'text-[#b7df93]'
        : result === 'dark'
            ? 'text-[#e29a72]'
            : 'text-[#e2c27a]';

    return (
        <motion.div
            className={`py-1 text-center ${parchmentSerif.className} ${colorClass}`}
            animate={{
                scale: [1, 1.035, 1],
                opacity: [0.92, 1, 0.92],
                textShadow: [
                    '0 0 0 rgba(0,0,0,0)',
                    result === 'light'
                        ? '0 0 18px rgba(68,146,84,0.28)'
                        : result === 'dark'
                            ? '0 0 18px rgba(159,61,52,0.24)'
                            : '0 0 16px rgba(163,116,53,0.22)',
                    '0 0 0 rgba(0,0,0,0)',
                ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
            <div className="text-[2.6rem] font-bold leading-none tracking-[0.04em] md:text-[4.2rem]">
                {t(RESULT_LABEL_KEYS[result])}
            </div>
        </motion.div>
    );
}

export function BattleSummaryOverlay({
    isOpen,
    summary,
    loading = false,
    playAnimation = true,
    onClose,
    onPrimaryAction,
    primaryActionLabel,
    onSecondaryAction = null,
    secondaryActionLabel = null,
}: BattleSummaryOverlayProps) {
    const { language, t } = useI18n();
    const [introChars, setIntroChars] = useState(0);
    const [revealStep, setRevealStep] = useState(0);
    const animatedBattleIdsRef = useRef<Set<string>>(new Set());
    const animationStartedKeyRef = useRef<string | null>(null);

    const readySummary = summary?.isComplete ? summary : null;
    const summaryReady = Boolean(readySummary);
    const introText = readySummary?.introText || t('battle_summary.intro_pending');
    const introMarker = t('battle_summary.tree_accepts_blow_marker');
    const formattedIntroText = useMemo(() => formatIntroText(introText, introMarker), [introMarker, introText]);
    const animationKey = readySummary?.battleId || '__battle-summary-pending__';
    const orderedLines = useMemo(() => getOrderedLines(readySummary), [readySummary]);
    const finalTreeNote = useMemo(() => getFinalTreeNote(readySummary, Boolean(loading), t), [loading, readySummary, t]);
    const animationAlreadyPlayed = animatedBattleIdsRef.current.has(animationKey);
    const instantReveal = summaryReady && (!playAnimation || animationAlreadyPlayed);
    const earlyLines = useMemo(
        () => orderedLines.filter((line) => !['total_dark_damage', 'total_light_damage'].includes(line.key)),
        [orderedLines],
    );
    const endingLines = useMemo(
        () => orderedLines.filter((line) => ['total_dark_damage', 'total_light_damage'].includes(line.key)),
        [orderedLines],
    );
    const hasResultStep = Boolean(readySummary?.result);
    const hasFinalTreeNoteStep = Boolean(finalTreeNote);
    const totalRevealSteps = earlyLines.length
        + (hasResultStep ? 1 : 0)
        + endingLines.length
        + (hasFinalTreeNoteStep ? 1 : 0);
    const revealComplete = instantReveal || (introChars >= formattedIntroText.length && revealStep >= totalRevealSteps);
    const canCloseSummary = revealComplete;
    const visibleEarlyLineCount = Math.min(earlyLines.length, revealStep);
    const stepsAfterEarlyLines = Math.max(0, revealStep - earlyLines.length);
    const showResultWord = hasResultStep && stepsAfterEarlyLines > 0;
    const stepsAfterResultWord = Math.max(0, stepsAfterEarlyLines - (hasResultStep ? 1 : 0));
    const visibleEndingLineCount = Math.min(endingLines.length, stepsAfterResultWord);
    const stepsAfterEndingLines = Math.max(0, stepsAfterResultWord - endingLines.length);
    const showFinalTreeNote = hasFinalTreeNoteStep && stepsAfterEndingLines > 0;

    useEffect(() => {
        if (!isOpen || !summaryReady) {
            animationStartedKeyRef.current = null;
            setIntroChars(0);
            setRevealStep(0);
            return;
        }

        if (instantReveal) {
            setIntroChars(formattedIntroText.length);
            setRevealStep(totalRevealSteps);
            animatedBattleIdsRef.current.add(animationKey);
            return;
        }

        if (animationStartedKeyRef.current !== animationKey) {
            animationStartedKeyRef.current = animationKey;
            setIntroChars(0);
            setRevealStep(0);
            return;
        }
        if (introChars >= formattedIntroText.length) {
            return;
        }

        const introTimer = window.setTimeout(() => {
            setIntroChars((current) => Math.min(formattedIntroText.length, current + INTRO_TYPE_STEP));
        }, INTRO_TYPE_DELAY_MS);

        return () => {
            window.clearTimeout(introTimer);
        };
    }, [animationKey, formattedIntroText.length, instantReveal, introChars, isOpen, summaryReady, totalRevealSteps]);

    useEffect(() => {
        if (!isOpen || !summaryReady) return;
        if (instantReveal) {
            setRevealStep(totalRevealSteps);
            return;
        }
        if (introChars < formattedIntroText.length) return;
        if (revealStep >= totalRevealSteps) {
            animatedBattleIdsRef.current.add(animationKey);
            return;
        }

        const timer = window.setTimeout(() => {
            setRevealStep((current) => Math.min(totalRevealSteps, current + 1));
        }, LINE_REVEAL_DELAY_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [animationKey, formattedIntroText.length, instantReveal, introChars, isOpen, revealStep, summaryReady, totalRevealSteps]);

    const handleClose = () => {
        if (!canCloseSummary) return;
        onClose();
    };

    const visibleEarlyLines = useMemo(
        () => earlyLines.slice(0, visibleEarlyLineCount),
        [earlyLines, visibleEarlyLineCount],
    );
    const visibleEndingLines = useMemo(
        () => endingLines.slice(0, visibleEndingLineCount),
        [endingLines, visibleEndingLineCount],
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <div
                        className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(39,25,10,0.38)_0%,rgba(9,5,1,0.82)_55%,rgba(0,0,0,0.9)_100%)] backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    <motion.div
                        layout
                        initial={{ opacity: 0, scaleY: 0.82, scaleX: 0.985, y: 18 }}
                        animate={{ opacity: 1, scaleY: 1, scaleX: 1, y: 0 }}
                        exit={{ opacity: 0, scaleY: 0.92, scaleX: 0.99, y: 18 }}
                        transition={{ duration: 0.38, ease: 'easeOut' }}
                        className={`relative z-10 flex w-full max-w-[min(96vw,1080px)] flex-col ${parchmentSerif.className}`}
                        style={{ transformOrigin: 'top center' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="pointer-events-none absolute inset-x-10 -top-4 h-8 rounded-full bg-[linear-gradient(180deg,#4d2f16_0%,#69421f_45%,#9c7542_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.42)]" />
                        <div className="pointer-events-none absolute inset-x-10 -bottom-4 h-8 rounded-full bg-[linear-gradient(180deg,#9c7542_0%,#69421f_55%,#4d2f16_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.42)]" />

                        <div className="relative overflow-hidden rounded-[34px] border border-[#8a6435]/55 bg-[linear-gradient(180deg,#74502b_0%,#624220_24%,#563717_55%,#472d13_100%)] shadow-[0_36px_90px_rgba(0,0,0,0.5)]">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(230,198,135,0.16)_0%,rgba(230,198,135,0)_30%),linear-gradient(90deg,rgba(35,20,8,0.18)_0%,rgba(110,77,41,0.06)_12%,rgba(110,77,41,0.06)_88%,rgba(35,20,8,0.18)_100%),radial-gradient(circle_at_14%_18%,rgba(214,177,101,0.12)_0%,rgba(214,177,101,0)_18%),radial-gradient(circle_at_84%_72%,rgba(33,19,8,0.26)_0%,rgba(33,19,8,0)_22%),radial-gradient(circle_at_45%_58%,rgba(153,117,58,0.1)_0%,rgba(153,117,58,0)_28%)]" />
                            <div className="pointer-events-none absolute inset-0 opacity-30 bg-[linear-gradient(115deg,transparent_0%,transparent_38%,rgba(232,198,124,0.07)_45%,transparent_52%,transparent_100%)]" />
                            <div className="pointer-events-none absolute inset-y-0 left-4 w-[1px] bg-[#c8a463]/25" />
                            <div className="pointer-events-none absolute inset-y-0 right-4 w-[1px] bg-[#c8a463]/25" />

                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={!canCloseSummary}
                                className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#aa8247]/35 bg-[#5a3919]/92 text-[#efcf8b] transition hover:border-[#c49a5d]/55 hover:bg-[#6a4520]"
                                aria-label={t('battle_summary.close_aria')}
                            >
                                <X size={18} />
                            </button>

                            <div className="max-h-[90vh] overflow-y-auto px-4 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
                                <div className="mx-auto max-w-4xl">
                                    <div className="text-center">
                                        <div className="text-[1.8rem] font-bold tracking-[0.04em] text-[#efcf8b] md:text-[2.35rem]">
                                            {t('battle_summary.title')}
                                        </div>
                                    </div>

                                    <motion.div
                                        layout
                                        transition={{ layout: { duration: 0.45, ease: 'easeOut' } }}
                                        className="mt-6 rounded-[28px] border border-[#9a7543]/40 bg-[linear-gradient(180deg,rgba(96,66,34,0.95)_0%,rgba(70,46,22,0.97)_100%)] px-4 py-5 shadow-[0_18px_44px_rgba(0,0,0,0.26)] md:px-6"
                                    >
                                        {!summaryReady ? (
                                            <div className="text-lg leading-relaxed text-[#e6c98a]">
                                                {t('battle_summary.full_pending')}
                                            </div>
                                        ) : (
                                            <div className="text-center text-[1.1rem] leading-relaxed text-[#f0d38d] md:text-[1.3rem]">
                                                <span className={`whitespace-pre-line ${parchmentSerif.className}`}>
                                                    {formattedIntroText.slice(0, introChars)}
                                                </span>
                                                {introChars < formattedIntroText.length ? (
                                                    <span className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse bg-[#c79d4a] align-[-0.16em]" />
                                                ) : null}
                                            </div>
                                        )}
                                    </motion.div>

                                    <motion.div
                                        layout
                                        transition={{ layout: { duration: 0.45, ease: 'easeOut' } }}
                                        className="mt-5 space-y-4"
                                    >
                                        {visibleEarlyLines.map((line, index) => (
                                            <SummaryLineCard
                                                key={line.key}
                                                summary={summary}
                                                line={line}
                                                lineIndex={index}
                                                instant={instantReveal}
                                                t={t}
                                                language={language}
                                            />
                                        ))}
                                    </motion.div>

                                    {showResultWord && readySummary?.result ? (
                                        <div className="mt-7">
                                            <ResultWord result={readySummary?.result || null} t={t} />
                                        </div>
                                    ) : null}

                                    <motion.div
                                        layout
                                        transition={{ layout: { duration: 0.45, ease: 'easeOut' } }}
                                        className="mt-5 space-y-4"
                                    >
                                        {visibleEndingLines.map((line, index) => (
                                            <SummaryLineCard
                                                key={line.key}
                                                summary={summary}
                                                line={line}
                                                lineIndex={earlyLines.length + index}
                                                instant={instantReveal}
                                                t={t}
                                                language={language}
                                            />
                                        ))}
                                    </motion.div>

                                    {showFinalTreeNote && finalTreeNote ? (
                                        <motion.div
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.28, ease: 'easeOut' }}
                                            className="mt-6 rounded-[26px] border border-[#9a7543]/38 bg-[linear-gradient(180deg,rgba(92,63,31,0.96)_0%,rgba(63,41,20,0.98)_100%)] px-5 py-5 text-center shadow-[0_16px_42px_rgba(0,0,0,0.28)]"
                                        >
                                            <div className={`text-[1.35rem] font-bold leading-tight text-[#efcf8b] md:text-[1.75rem] ${parchmentSerif.className}`}>
                                                {finalTreeNote}
                                            </div>
                                        </motion.div>
                                    ) : null}

                                    {(!summaryReady || loading) && (
                                        <div className="mt-5 text-center text-sm italic text-[#d7b77a] md:text-base">
                                            {t('battle_summary.pending_note')}
                                        </div>
                                    )}

                                    <div className="mt-7 flex flex-col items-center justify-center gap-3 pb-1 sm:flex-row sm:justify-center">
                                        {revealComplete && onSecondaryAction && secondaryActionLabel ? (
                                            <button
                                                type="button"
                                                onClick={onSecondaryAction}
                                                className="rounded-[20px] border border-[#8f6331]/28 bg-[linear-gradient(180deg,#fff4d7_0%,#efd5a0_100%)] px-5 py-3 text-base font-semibold text-[#5a3412] transition hover:border-[#8f6331]/46 hover:bg-[linear-gradient(180deg,#fff2cf_0%,#ecc98a_100%)]"
                                            >
                                                {secondaryActionLabel}
                                            </button>
                                        ) : null}
                                        {revealComplete ? (
                                            <button
                                                type="button"
                                                onClick={onPrimaryAction}
                                                className="rounded-[20px] border border-[#76431a]/25 bg-[linear-gradient(180deg,#7c4a1f_0%,#5e3413_100%)] px-5 py-3 text-base font-semibold text-[#fff4df] transition hover:border-[#76431a]/45 hover:brightness-110"
                                            >
                                                {primaryActionLabel}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

