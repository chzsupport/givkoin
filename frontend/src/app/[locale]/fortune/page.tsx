'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    Coins,
    Star,
    Ticket,
    Trophy,
    Clock,
    Gift,
    TrendingUp,
    Users,
    ChevronRight,
    Crown,
    Zap,
} from 'lucide-react';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import { useI18n } from '@/context/I18nContext';

// --- ТИПЫ ---
interface FortuneStats {
    totalPlayers: number;
    totalWins: number;
    jackpotsThisMonth: number;
    avgDailyPlayers: number;
    leaderboard: LeaderEntry[];
    recentWinners: LuckyWinner[];
}

interface LeaderEntry {
    rank: number;
    name: string;
    wins: number;
}

interface LuckyWinner {
    name: string;
    prize: string;
    date: string;
}

function emitRewardOffer(offer: unknown) {
    if (typeof window === 'undefined') return;
    if (!offer || typeof offer !== 'object' || !('id' in offer)) return;
    window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}

export default function FortunePage() {
    const { user, refreshUser, updateUser } = useAuth();
    const toast = useToast();
    const { localePath, t } = useI18n();
    const [stats, setStats] = useState<FortuneStats | null>(null);
    const [showLuckyResult, setShowLuckyResult] = useState(false);
    const [luckyPrize, setLuckyPrize] = useState<string | null>(null);
    const [pendingLuckyOffer, setPendingLuckyOffer] = useState<unknown>(null);
    const [isSpinningLucky, setIsSpinningLucky] = useState(false);
    const [spinsLeft, setSpinsLeft] = useState(0);
    const [ticketsToday, setTicketsToday] = useState(0);
    const [windowWidth, setWindowWidth] = useState(0);
    const [isLandscape, setIsLandscape] = useState(false);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
    const isDesktop = Boolean(sideAdSlot);
    const luckyRequestLockRef = useRef(false);

    const formatUserK = (value: number) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return '0';
        const whole = Math.floor(n);
        const frac = n - whole;
        const normalized = frac >= 0.59 ? whole + 1 : frac > 0 ? whole + 0.5 : whole;
        return new Intl.NumberFormat(getSiteLanguageLocale(getSiteLanguage()), {
            minimumFractionDigits: normalized % 1 === 0 ? 0 : 1,
            maximumFractionDigits: 1,
        }).format(normalized);
    };

    const fetchStats = async () => {
        try {
            const data = await apiGet<unknown>('/fortune/stats');
            const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
            const d = isObj(data) ? data : {};
            const world = isObj(d.world) ? d.world : {};
            const roulette = isObj(d.roulette) ? d.roulette : {};

            const mappedStats: FortuneStats = {
                totalPlayers: (Number(world.totalFortunePlayers) || 0) + (Number(world.totalLotteryPlayers) || 0),
                totalWins: Number(roulette.totalSpins) || 0,
                jackpotsThisMonth: Number(world.maxFortuneWin) || 0,
                avgDailyPlayers: Number(roulette.activeUsers) || 0,
                leaderboard: (Array.isArray(roulette.topSpinners) ? roulette.topSpinners : []).slice(0, 5).map((s, i: number) => {
                    const row = isObj(s) ? s : {};
                    const name = typeof row.nickname === 'string' ? row.nickname.trim() : '';
                    return {
                        rank: i + 1,
                        name,
                        wins: Number(row.totalSpins) || 0,
                    };
                }).filter((row) => row.name),
                recentWinners: (Array.isArray(roulette.recentActivity) ? roulette.recentActivity : []).map((s) => {
                    const row = isObj(s) ? s : {};
                    const name = typeof row.nickname === 'string' ? row.nickname.trim() : '';
                    const lastSpinAt = row.lastSpinAt;
                    const date = typeof lastSpinAt === 'string' || typeof lastSpinAt === 'number' ? new Date(lastSpinAt).toLocaleDateString() : '';
                    return {
                        name,
                        prize: typeof row.prize === 'string' ? row.prize : '',
                        date,
                    };
                }).filter((row) => row.name),
            };

            setStats(mappedStats);
        } catch (e) {
            console.error('Failed to fetch fortune stats:', e);
        }
    };

    const fetchSpinsAndTickets = async () => {
        try {
            const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

            const spinStatus = await apiGet<unknown>('/fortune/status');
            if (isObj(spinStatus)) {
                setSpinsLeft(Number(spinStatus.spinsLeft) || 0);
                if (typeof spinStatus.luckyDayAvailable === 'boolean' && user) {
                    updateUser({ ...user, luckyDayAvailable: spinStatus.luckyDayAvailable } as typeof user);
                }
            }

            const lotteryStatus = await apiGet<unknown>('/fortune/lottery/status');
            if (isObj(lotteryStatus)) setTicketsToday(Number(lotteryStatus.ticketsToday) || 0);
        } catch (e) {
            console.error('Failed to fetch spins/tickets:', e);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchSpinsAndTickets();

        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setWindowWidth(w);
            const isLand = w > h;
            setIsLandscape(isLand);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    const handleLuckyDraw = async () => {
        if (!user?.luckyDayAvailable || isSpinningLucky || luckyRequestLockRef.current) return;

        luckyRequestLockRef.current = true;
        setIsSpinningLucky(true);
        try {
            const res = await apiPost<unknown>('/fortune/lucky-draw', {}, { suppressBoostOffer: true });
            const prize = typeof res === 'object' && res !== null && 'prize' in res ? String((res as { prize?: unknown }).prize) : '';
            setLuckyPrize(prize);
            setPendingLuckyOffer(typeof res === 'object' && res !== null ? (res as { boostOffer?: unknown }).boostOffer || null : null);
            setShowLuckyResult(true);
            updateUser({ ...user, luckyDayAvailable: false });
            await Promise.all([
                refreshUser(),
                fetchStats(),
                fetchSpinsAndTickets(),
            ]);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('fortune.lucky_draw_error'));
        } finally {
            setIsSpinningLucky(false);
            luckyRequestLockRef.current = false;
        }
    };

    const closeLuckyResult = () => {
        setShowLuckyResult(false);
        const offer = pendingLuckyOffer;
        setPendingLuckyOffer(null);
        if (offer) {
            window.setTimeout(() => emitRewardOffer(offer), 160);
        }
    };

    return (
        <div className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-yellow-500/30`}>
            {/* Фоновые эффекты */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#050510] to-[#050510]" />
                <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/3 left-1/3 w-48 h-48 bg-yellow-600/5 rounded-full blur-3xl" />
            </div>

            {/* Основной контейнер */}
            <div className="relative z-10 flex flex-1 min-h-0">
                {/* Левый рекламный блок - показываем только в ландшафтном режиме на больших экранах */}
                <StickySideAdRail adSlot={sideAdSlot} page="fortune" placement="fortune_sidebar_left" />

                {/* Центральный контент */}
                <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
                    {/* MOBILE AD BLOCK - Dynamic sizes for Tablets/Mobile. Скрываем в ландшафтном режиме на больших экранах */}
                    <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
                        <AdaptiveAdWrapper
                            page="fortune"
                            placement="fortune_header"
                            strategy="mobile_tablet_adaptive"
                        />
                    </div>

                    {/* Хедер страницы */}
                    <header className="flex flex-col gap-2 mb-2 flex-shrink-0">
                        <div className="flex items-center justify-between gap-3">
                            <Link
                                href={localePath('/tree')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                            >
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('fortune.to_tree')}
                            </Link>

                            <div className="flex gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 backdrop-blur-md text-tiny">
                                <div className="flex items-center gap-1 text-yellow-400 font-bold">
                                    <Coins className="w-3.5 h-3.5" />
                                    <span>{formatUserK(user?.k ?? 0)}</span>
                                </div>
                                <div className="w-px bg-white/10" />
                                <div className="flex items-center gap-1 text-blue-300">
                                    <Star className="w-3.5 h-3.5 fill-current" />
                                    <span>{user?.stars?.toFixed(2) || '0.00'}</span>
                                </div>
                            </div>
                        </div>

                        <PageTitle
                            title={t('fortune.title')}
                            Icon={Sparkles}
                            gradientClassName="from-yellow-200 via-yellow-400 to-orange-500"
                            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-yellow-400"
                        />
                    </header>

                    {/* Грид контента - на планшетах в портрете всегда 1 колонка, на десктопе 2-3 */}
                    <div className={`flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 ${isLandscape ? '2xl:grid-cols-3' : ''} gap-2 lg:gap-3`}>
                        {/* Левая колонка - занимает всю ширину на мобильных/планшетах */}
                        <div className={`flex flex-col gap-2 min-h-0 ${isLandscape ? '2xl:col-span-2' : 'col-span-1'}`}>
                            {/* Карточки игр */}
                            <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                                <Link href={localePath('/fortune/roulette')} className="group">
                                    <div className="relative h-24 lg:h-28 bg-gradient-to-br from-yellow-900/40 via-yellow-800/20 to-transparent border border-yellow-500/30 rounded-xl p-3 cursor-pointer transition-all hover:border-yellow-500/60">
                                        <div className="absolute right-2 bottom-2 opacity-15">
                                            <Sparkles className="w-12 h-12 text-yellow-400" />
                                        </div>
                                        <div className="relative z-10 h-full flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="w-6 h-6 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                                                        <Sparkles className="w-3 h-3 text-yellow-400" />
                                                    </div>
                                                    <h3 className="text-secondary font-bold text-yellow-400">{t('fortune.roulette')}</h3>
                                                </div>
                                                <p className="text-gray-400 text-tiny">{t('fortune.roulette_spins_per_day')}</p>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-tiny">
                                                    {spinsLeft}/3
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-yellow-400" />
                                            </div>
                                        </div>
                                    </div>
                                </Link>

                                <Link href={localePath('/fortune/lottery')} className="group">
                                    <div className="relative h-24 lg:h-28 bg-gradient-to-br from-blue-900/40 via-blue-800/20 to-transparent border border-blue-500/30 rounded-xl p-3 cursor-pointer transition-all hover:border-blue-500/60">
                                        <div className="absolute right-2 bottom-2 opacity-15">
                                            <Ticket className="w-12 h-12 text-blue-400" />
                                        </div>
                                        <div className="relative z-10 h-full flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                        <Ticket className="w-3 h-3 text-blue-400" />
                                                    </div>
                                                    <h3 className="text-secondary font-bold text-blue-400">{t('fortune.lottery')}</h3>
                                                </div>
                                                <p className="text-gray-400 text-tiny">{t('fortune.lottery_schedule')}</p>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-tiny">
                                                    {ticketsToday}/10
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-blue-400" />
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </div>

                            {/* Личная Удача */}
                            <div className="relative bg-gradient-to-br from-purple-900/30 via-pink-900/20 to-transparent border border-purple-500/30 rounded-xl p-2.5 lg:p-3 flex-shrink-0">
                                <div className="relative z-10 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                                            <Gift className="w-4 h-4 lg:w-5 lg:h-5 text-purple-300" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-secondary font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                                                {t('fortune.personal_luck')}
                                            </h3>
                                            <p className="text-gray-400 text-tiny truncate">{t('fortune.daily')}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleLuckyDraw}
                                        disabled={!user?.luckyDayAvailable || isSpinningLucky}
                                        className={`
                                            px-3 lg:px-5 py-1.5 lg:py-2 rounded-lg font-bold text-secondary transition-all flex-shrink-0
                                            ${user?.luckyDayAvailable && !isSpinningLucky
                                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-105'
                                                : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                                            }
                                        `}
                                    >
                                        {isSpinningLucky ? '...' : user?.luckyDayAvailable ? (
                                            <span className="flex items-center gap-1">
                                                <Gift className="w-3 h-3" />
                                                {t('fortune.receive')}
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {t('fortune.tomorrow')}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Лидерборд */}
                            <div className="flex-1 min-h-0 bg-white/5 border border-white/10 rounded-xl p-2 lg:p-3 flex flex-col">
                                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                                    <h3 className="font-bold text-white text-secondary flex items-center gap-1.5">
                                        <Trophy className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-yellow-400" />
                                        {t('fortune.leaders')}
                                    </h3>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 lg:space-y-1.5 custom-scrollbar">
                                    {stats?.leaderboard?.length ? (
                                        stats.leaderboard.map((entry, idx) => (
                                            <div
                                                key={idx}
                                                className={`
                                                flex items-center gap-2 p-1.5 lg:p-2 rounded-lg text-tiny
                                                ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/30' :
                                                        idx === 1 ? 'bg-gradient-to-r from-gray-400/10 to-transparent border border-gray-400/20' :
                                                            idx === 2 ? 'bg-gradient-to-r from-orange-600/10 to-transparent border border-orange-600/20' :
                                                                'bg-white/5 border border-transparent'
                                                    }
                                                `}
                                            >
                                                <div className={`
                                                w-5 h-5 lg:w-6 lg:h-6 rounded flex items-center justify-center font-bold text-tiny flex-shrink-0
                                                ${idx === 0 ? 'bg-yellow-500/30 text-yellow-300' :
                                                        idx === 1 ? 'bg-gray-400/30 text-gray-300' :
                                                            idx === 2 ? 'bg-orange-600/30 text-orange-300' :
                                                                'bg-white/10 text-gray-400'
                                                    }
                                                `}>
                                                    {idx === 0 ? <Crown className="w-2.5 h-2.5" /> : entry.rank}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-white text-tiny lg:text-tiny truncate">{entry.name}</div>
                                                </div>
                                                <div className="text-yellow-400 font-bold text-tiny lg:text-tiny flex-shrink-0">{entry.wins.toLocaleString()}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-tiny text-white/55">
                                            {t('fortune.no_leader_data')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Правая колонка - всегда 1 колонка из 2 в портрете, блоки стопкой */}
                        <div className="flex flex-col gap-2 min-h-0 col-span-1">
                            {/* Статистика */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-2 lg:p-3 flex-shrink-0">
                                <h3 className="font-bold text-white text-secondary flex items-center gap-1.5 mb-2">
                                    <TrendingUp className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-green-400" />
                                    {t('fortune.stats')}
                                </h3>

                                <div className="grid grid-cols-2 gap-1.5 lg:gap-2">
                                    <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                                        <Users className="w-3 h-3 lg:w-4 lg:h-4 text-blue-400 mx-auto mb-0.5" />
                                        <div className="text-secondary font-bold text-white">{(((stats?.totalPlayers || 0)) / 1000).toFixed(1)}K</div>
                                        <div className="text-tiny text-gray-500">{t('fortune.players')}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                                        <Trophy className="w-3 h-3 lg:w-4 lg:h-4 text-yellow-400 mx-auto mb-0.5" />
                                        <div className="text-secondary font-bold text-white">{(((stats?.totalWins || 0)) / 1000).toFixed(0)}K</div>
                                        <div className="text-tiny text-gray-500">{t('fortune.wins')}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                                        <Star className="w-3 h-3 lg:w-4 lg:h-4 text-purple-400 mx-auto mb-0.5" />
                                        <div className="text-secondary font-bold text-white">{stats?.jackpotsThisMonth || 0}</div>
                                        <div className="text-tiny text-gray-500">{t('fortune.jackpot')}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                                        <Zap className="w-3 h-3 lg:w-4 lg:h-4 text-green-400 mx-auto mb-0.5" />
                                        <div className="text-secondary font-bold text-white">{(((stats?.avgDailyPlayers || 0)) / 1000).toFixed(1)}K</div>
                                        <div className="text-tiny text-gray-500">{t('fortune.per_day')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Счастливчики */}
                            <div className="flex-1 min-h-0 bg-gradient-to-br from-purple-900/20 to-transparent border border-purple-500/20 rounded-xl p-2 lg:p-3 flex flex-col">
                                <h3 className="font-bold text-white text-secondary flex items-center gap-1.5 mb-2 flex-shrink-0">
                                    <Gift className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-purple-400" />
                                    {t('fortune.winners')}
                                </h3>

                                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 lg:space-y-1.5 custom-scrollbar">
                                    {stats?.recentWinners?.length ? (
                                        stats.recentWinners.slice(0, 5).map((winner, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between p-1.5 lg:p-2 bg-white/5 rounded-lg text-tiny"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>🎁</span>
                                                    <span className="text-white truncate">{winner.name}</span>
                                                </div>
                                                <div className="text-purple-300 font-medium flex-shrink-0">{winner.prize}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-tiny text-white/55">
                                            {t('fortune.no_recent_winners')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Правый рекламный блок - показываем только в ландшафтном режиме */}
                <StickySideAdRail adSlot={sideAdSlot} page="fortune" placement="fortune_sidebar_right" />
            </div>

            {/* Модальное окно */}
            <AnimatePresence>
                {showLuckyResult && luckyPrize && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                        onClick={closeLuckyResult}
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="bg-gradient-to-br from-purple-900/90 to-pink-900/90 border border-purple-500/30 rounded-3xl p-8 text-center max-w-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-6xl mb-4">🎁</div>
                            <h2 className="text-h2 text-white mb-2">{t('fortune.congrats')}</h2>
                            <p className="text-body mb-4">{t('fortune.you_received')}</p>
                            <div className="text-h1 text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-400 mb-6">
                                {luckyPrize}
                            </div>
                            <button
                                onClick={closeLuckyResult}
                                className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-secondary"
                            >
                                {t('fortune.great')}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

