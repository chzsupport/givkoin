'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

export function BattleVoiceCommandBanner({
    visible,
    label,
    progress,
}: {
    visible: boolean;
    label: string;
    progress: number;
}) {
    if (!visible) return null;

    return (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-48 md:bottom-36 z-50 pointer-events-none px-2">
            <div className="px-4 md:px-6 py-2.5 md:py-3 rounded-2xl bg-black/70 border border-red-500/30 text-center backdrop-blur-md">
                <div className="text-white font-black uppercase tracking-widest text-xs md:text-h3">
                    {label}
                </div>
                <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${progress * 100}%` }} />
                </div>
            </div>
        </div>
    );
}

export function BattleConnectionLostOverlay({
    visible,
    title,
    description,
    actionLabel,
    onRefresh,
}: {
    visible: boolean;
    title: string;
    description: string;
    actionLabel: string;
    onRefresh: () => void;
}) {
    if (!visible) return null;

    return (
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-50 pointer-events-auto px-4">
            <div className="px-6 py-4 rounded-2xl bg-red-900/80 border border-red-500/50 text-center backdrop-blur-md shadow-[0_0_30px_rgba(239,68,68,0.4)]">
                <div className="text-red-200 font-bold text-sm md:text-base mb-2">
                    ⚠️ {title}
                </div>
                <div className="text-red-300/80 text-xs md:text-sm mb-3">
                    {description}
                </div>
                <button
                    onClick={onRefresh}
                    className="px-4 py-2 rounded-lg bg-red-600/50 hover:bg-red-500/60 text-white text-xs font-bold uppercase tracking-wide transition-colors"
                >
                    {actionLabel}
                </button>
            </div>
        </div>
    );
}

export function BattleHud({
    visible,
    damageLabel,
    participantsLabel,
    lumensLabel,
    comboLabel,
    userDamage,
    attendanceCount,
    displayedLumens,
    comboCount,
    comboMultiplier,
}: {
    visible: boolean;
    damageLabel: string;
    participantsLabel: string;
    lumensLabel: string;
    comboLabel: string;
    userDamage: number;
    attendanceCount: number;
    displayedLumens: number;
    comboCount: number;
    comboMultiplier: number;
}) {
    if (!visible) return null;

    return (
        <div
            className="absolute right-3 md:right-6 z-50 flex flex-col items-end gap-1.5 md:gap-2 pointer-events-none"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.8rem)' }}
        >
            <div className="px-3 md:px-4 py-1 bg-cyan-500/20 border border-cyan-500/50 text-cyan-200 text-caption md:text-tiny font-bold rounded uppercase tracking-widest backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                {damageLabel} <span className="tabular-nums">{userDamage.toLocaleString()}</span>
            </div>
            <div className="px-3 md:px-4 py-1 bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 text-caption md:text-tiny font-bold rounded uppercase tracking-widest backdrop-blur-md">
                {participantsLabel} <span className="tabular-nums">{attendanceCount.toLocaleString()}</span>
            </div>
            <div className="px-2.5 md:px-3 py-1 bg-blue-500/20 border border-blue-500/50 text-blue-200 text-caption md:text-tiny font-bold rounded uppercase tracking-widest backdrop-blur-md">
                {lumensLabel} {displayedLumens.toLocaleString()}
            </div>
            {comboMultiplier > 1 && (
                <div className="self-end">
                    <div className="px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-400/45 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.25)] backdrop-blur-md">
                        <div className="flex items-center gap-2">
                            <span className="text-caption font-black uppercase tracking-[0.28em] text-amber-200/80">
                                {comboLabel}
                            </span>
                            <span className="text-base font-black tabular-nums leading-none">
                                {comboCount}
                            </span>
                            <span className="text-caption font-black tracking-widest text-amber-200 leading-none">
                                x{comboMultiplier % 1 === 0 ? comboMultiplier.toFixed(0) : comboMultiplier.toFixed(1)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function BattleRulesModal({
    visible,
    title,
    paragraphs,
    rulesHref,
    openRulesLabel,
    okLabel,
    onClose,
}: {
    visible: boolean;
    title: string;
    paragraphs: string[];
    rulesHref: string;
    openRulesLabel: string;
    okLabel: string;
    onClose: () => void;
}) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    className="fixed inset-0 z-[130] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative z-10 w-full max-w-xl rounded-2xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl backdrop-blur-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-h3 text-white font-black uppercase tracking-widest">{title}</div>
                        <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-4 text-secondary text-white/75 whitespace-pre-wrap custom-scrollbar">
                            <div className="space-y-3 text-secondary text-white/75">
                                {paragraphs.map((paragraph, index) => (
                                    <p key={index}>
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
                            <Link
                                href={rulesHref}
                                onClick={onClose}
                                className="text-center rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-secondary font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                {openRulesLabel}
                            </Link>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl bg-primary-light px-5 py-2 text-secondary font-semibold text-primary-dark transition-transform hover:scale-[1.02]"
                            >
                                {okLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
