'use client';

import { useAuth } from '@/context/AuthContext';
import { PageBackground } from '@/components/PageBackground';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { AdBlock } from '@/components/AdBlock';
import { EntityAskModal } from '@/components/entity/EntityAskModal';
import { apiGet, apiPost } from '@/utils/api';
import Image from 'next/image';
import { useI18n } from '@/context/I18nContext';

export default function EntityProfilePage() {
    const { user, refreshUser } = useAuth();
    const router = useRouter();
    const { localePath, t } = useI18n();
    const [windowWidth, setWindowWidth] = useState(0);

    const [isFaqOpen, setIsFaqOpen] = useState(false);
    const [showChangeConfirm, setShowChangeConfirm] = useState(false);

    const [moodDiag, setMoodDiag] = useState<null | {
        mood: string;
        rawMood: string;
        corePercent: number;
        additionalMet: number;
        confirmedCount: number;
        activeDebuff: boolean;
        isSated: boolean;
    }>(null);

    useEffect(() => {
        if (user && !user.entity) {
            router.replace(localePath('/entity/create'));
        }
    }, [user, router, localePath]);
    const entity = user?.entity;
    const entityId = entity?._id;

    useEffect(() => {
        if (!entityId) return;
        apiGet<{ diagnostics: {
            mood: string;
            rawMood: string;
            corePercent: number;
            additionalMet: number;
            confirmedCount: number;
            activeDebuff: boolean;
            isSated: boolean;
        } }>('/entity/mood-diagnostics')
            .then((r) => setMoodDiag(r?.diagnostics || null))
            .catch(() => setMoodDiag(null));
    }, [entityId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const update = () => setWindowWidth(window.innerWidth);
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const isDesktop = windowWidth > 1024;

    const changeCooldownMs = 7 * 24 * 60 * 60 * 1000;
    const createdAt = entity?.createdAt ? new Date(entity.createdAt) : null;
    const changeAvailableAt = createdAt ? new Date(createdAt.getTime() + changeCooldownMs) : null;
    const msUntilChange = changeAvailableAt ? changeAvailableAt.getTime() - Date.now() : 0;
    const daysUntilChange = msUntilChange > 0 ? Math.ceil(msUntilChange / (24 * 60 * 60 * 1000)) : 0;
    const canChangeEntity = !changeAvailableAt || msUntilChange <= 0;

    const formatMood = (mood?: string) => {
        if (!mood) return t('entity_profile.mood_neutral');
        const map: Record<string, string> = {
            happy: t('entity_profile.mood_happy'),
            neutral: t('entity_profile.mood_neutral'),
            sad: t('entity_profile.mood_sad'),
        };
        return map[mood] || mood;
    };

    const satietyUntil = entity?.satietyUntil ? new Date(entity.satietyUntil) : null;
    const isSated = Boolean(satietyUntil && satietyUntil.getTime() > Date.now());
    const shownMood = moodDiag?.mood || (entity?.mood === 'happy' && !isSated ? 'neutral' : entity?.mood);
    const formatRemaining = (ms: number) => {
        const totalMinutes = Math.max(0, Math.floor(ms / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours <= 0) return `${minutes}${t('entity_profile.minutes_short')}`;
        return `${hours}${t('entity_profile.hours_short')} ${minutes}${t('entity_profile.minutes_short')}`;
    };

    const moodScEffectText = () => {
        if (shownMood === 'happy') return t('entity_profile.mood_effect_happy');
        if (shownMood === 'sad') return t('entity_profile.mood_effect_sad');
        return t('entity_profile.mood_effect_neutral');
    };

    if (!entity) return null;

    return (
        <div className="relative min-h-full lg:h-full w-full text-white flex flex-col overflow-y-auto lg:overflow-hidden pb-6 lg:pb-0">
            <PageBackground />

            {/* Content Wrapper - Fills available space */}
            <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:h-full px-4 sm:px-6 lg:px-10 py-3">

                {/* Back Button */}
                <div className="mb-3 shrink-0">
                    <Link
                        href={localePath('/tree')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('entity_profile.to_tree')}
                    </Link>
                </div>

                {/* Main Layout */}
                <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 flex-1 min-h-0">

                    {/* Left Column: Portrait */}
                    <div className="w-full xl:w-64 flex flex-col items-center xl:items-start shrink-0 gap-3">
                        {/* Portrait - Smaller on desktop to fit */}
                        <div className="relative w-32 sm:w-40 md:w-48 xl:w-full aspect-square rounded-2xl overflow-hidden border-2 border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.15)] bg-neutral-900 shrink-0">
                            <Image src={entity.avatarUrl} alt={entity.name} fill sizes="(max-width: 1280px) 192px, 256px" className="object-contain" unoptimized />
                        </div>

                        <div className="w-full text-center xl:text-left">
                            <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-blue-300 leading-tight break-words">
                                {entity.name}
                            </h1>
                            <div className="text-label text-neutral-500 mt-1">
                                {t('entity_profile.soul_reflection')}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsFaqOpen(true)}
                            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95"
                        >
                            {t('entity.ask')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!canChangeEntity) return;
                                setShowChangeConfirm(true);
                            }}
                            disabled={!canChangeEntity}
                            className={`w-full px-4 py-2 rounded-xl font-bold uppercase tracking-widest text-tiny transition-all ${canChangeEntity
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:brightness-110 active:scale-95'
                                : 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed'
                                }`}
                        >
                            {canChangeEntity
                                ? t('entity_profile.change_entity')
                                : `${t('entity_profile.change_in_days_prefix')}${daysUntilChange}${t('entity_profile.change_in_days_suffix')}`}
                        </button>
                    </div>

                    {/* Right Column: Name, Stats, Ad, Events */}
                    <div className="w-full flex-1 flex flex-col gap-3 xl:min-h-0 xl:overflow-hidden">
                        {/* Wide Ad */}
                        <div className="shrink-0 w-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <div className="text-caption uppercase tracking-[0.3em] text-gray-600 text-center py-1">
                                {t('entity_profile.ad')}
                            </div>
                            {isDesktop ? (
                                <AdBlock
                                    page="entity"
                                    placement="sidebar"
                                    hideTitle
                                    heightClass="h-[70px]"
                                    className="w-full"
                                    chromeless={true}
                                />
                            ) : (
                                <AdaptiveAdWrapper
                                    page="entity"
                                    placement="sidebar"
                                    strategy="mobile_tablet_adaptive"
                                    chromeless={true}
                                    className="w-full mx-auto"
                                />
                            )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 xl:gap-4 flex-1 min-h-0">
                            <div className="flex flex-col gap-3">
                                {/* Состояние */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                                    <div className="text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-3">{t('entity_profile.status_title')}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                                            <div className="text-label text-white/40 mb-0.5">{t('entity_profile.date')}</div>
                                            <div className="text-sm font-bold text-amber-200">{new Date(entity.createdAt).toLocaleDateString()}</div>
                                            <div className="text-caption text-white/50">{t('entity_profile.appearance')}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                                            <div className="text-label text-white/40 mb-0.5">{t('entity_profile.mood')}</div>
                                            <div className="text-sm font-bold text-green-400">{formatMood(shownMood)}</div>
                                            <div className="text-caption text-white/50">{moodScEffectText()}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                                            <div className="text-label text-white/40 mb-0.5">{t('entity_profile.satiety')}</div>
                                            <div className={`text-sm font-bold ${isSated ? 'text-emerald-300' : 'text-rose-300'}`}>{isSated ? t('entity_profile.sated') : t('entity_profile.hungry')}</div>
                                            <div className="text-caption text-white/50 leading-tight">
                                                {isSated && satietyUntil ? formatRemaining(satietyUntil.getTime() - Date.now()) : t('entity_profile.feed_prompt')}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                                            <div className="text-label text-white/40 mb-0.5">{t('entity_profile.bonus')}</div>
                                            <div className="text-sm font-bold text-white/80">{isSated ? '+10%' : '0%'}</div>
                                            <div className="text-caption text-white/50">{t('entity_profile.to_shine')}</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <Link
                                            href={localePath('/cabinet/warehouse')}
                                            className="text-center rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-tiny font-bold text-amber-200 hover:bg-amber-500/20 transition-colors"
                                        >
                                            📦 {t('entity_profile.feed')}
                                        </Link>
                                        <Link
                                            href={localePath('/shop')}
                                            className="text-center rounded-xl border border-white/10 bg-white/5 py-2.5 text-tiny font-bold text-white/70 hover:bg-white/10 transition-colors"
                                        >
                                            🛒 {t('entity_profile.buy_food')}
                                        </Link>
                                    </div>
                                </div>

                                {/* Диагностика */}
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                                    <div className="text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('entity_profile.activity_title')}</div>
                                    {!moodDiag ? (
                                        <div className="text-xs text-white/50 italic">{t('common.loading')}</div>
                                    ) : (
                                        <div className="text-xs text-white/80 leading-relaxed">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-1">
                                            <span className="text-white/50">{t('entity_profile.activity')}:</span>
                                            <span className="text-white/80 font-bold">{Math.round(moodDiag.corePercent)}%</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-white/5 py-1">
                                            <span className="text-white/50">{t('entity_profile.actions')}:</span>
                                            <span className="text-white/80 font-bold">{moodDiag.confirmedCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-1">
                                            <span className="text-white/50">{t('entity_profile.debuff')}:</span>
                                            <span className={`font-bold ${moodDiag.activeDebuff ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                {moodDiag.activeDebuff ? t('common.yes') : t('common.no')}
                                            </span>
                                        </div>
                                        {!moodDiag.isSated && (
                                            <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-caption text-rose-300 text-center">
                                                {t('entity_profile.entity_hungry_no_joy')}
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            </div>

                            {/* История */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm flex flex-col min-h-0 overflow-hidden">
                                <div className="text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('entity_profile.history_title')}</div>
                                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                    {Array.isArray(entity.history) && entity.history.length > 0 ? (
                                        entity.history.slice(0, 7).map((h, idx) => (
                                            <div key={idx} className="bg-black/20 border border-white/5 rounded-xl p-2.5">
                                                <div className="text-caption text-white/40 font-medium">{h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</div>
                                                <div className="text-xs text-white/70 mt-0.5 leading-snug">{h.message}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-white/30 italic">{t('entity_profile.no_events')}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <EntityAskModal
                isOpen={isFaqOpen}
                onClose={() => setIsFaqOpen(false)}
                entityName={entity.name}
            />

            <AnimatePresence>
                {showChangeConfirm && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowChangeConfirm(false)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900/95 p-6 shadow-2xl"
                        >
                            <div className="text-center space-y-3">
                                <div className="text-xs uppercase tracking-[0.35em] text-amber-400/80">{t('entity_profile.confirm_title')}</div>
                                <h3 className="text-lg font-bold text-white">{t('entity_profile.change_entity_q')}</h3>
                                <p className="text-sm text-neutral-400 leading-relaxed">
                                    {t('entity_profile.change_entity_desc')}
                                </p>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button
                                    onClick={() => setShowChangeConfirm(false)}
                                    className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            await apiPost('/entity/reset', {});
                                            await refreshUser();
                                            setShowChangeConfirm(false);
                                            router.push(localePath('/entity/create'));
                                        } catch (error) {
                                            console.error('Failed to reset entity:', error);
                                        }
                                    }}
                                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold uppercase tracking-widest text-white shadow-lg"
                                >
                                    {t('common.confirm')}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

