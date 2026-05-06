'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Coins, Star, Clock, RotateCw, ArrowLeft, Gift, TrendingUp, Award, Target, Activity } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatUserK } from '@/utils/formatters';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

const ROULETTE_SECTORS = [
    { label: '1', value: 1, type: 'k', color: '#3b82f6' },
    { label: '5', value: 5, type: 'k', color: '#6366f1' },
    { label: '10', value: 10, type: 'k', color: '#8b5cf6' },
    { label: '15', value: 15, type: 'k', color: '#a855f7' },
    { label: '20', value: 20, type: 'k', color: '#d946ef' },
    { label: '30', value: 30, type: 'k', color: '#ec4899' },
    { label: '40', value: 40, type: 'k', color: '#f43f5e' },
    { label: '50', value: 50, type: 'k', color: '#ef4444' },
    { label: '60', value: 60, type: 'k', color: '#f97316' },
    { label: '70', value: 70, type: 'k', color: '#f59e0b' },
    { label: '80', value: 80, type: 'k', color: '#eab308' },
    { label: '90', value: 90, type: 'k', color: '#84cc16' },
    { label: '100', value: 100, type: 'k', color: '#22c55e' },
    { label: '+1', value: 'spin', type: 'bonus', color: '#06b6d4' },
    { label: '0.1⭐', value: 0.1, type: 'star', color: '#fbbf24' },
];

const ROULETTE_LOADING_SPIN_DURATION = 0.55;
const ROULETTE_SETTLE_DURATION_MS = 1150;
const ROULETTE_SETTLE_DURATION_SEC = ROULETTE_SETTLE_DURATION_MS / 1000;
const ROULETTE_RESULT_TURNS = 1;

const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;

const WheelComponent = ({
    size,
    isSpinning,
    rotation,
    spinDuration,
    spinMode,
    onRotationUpdate,
}: {
    size: number;
    isSpinning: boolean;
    rotation: number;
    spinDuration: number;
    spinMode: 'idle' | 'loading' | 'settling';
    onRotationUpdate?: (rotation: number) => void;
}) => {
    const sectorAngle = 360 / ROULETTE_SECTORS.length;
    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[2%] z-20">
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[16px] border-t-yellow-400 filter drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]"
                    style={{ transform: `scale(${size / 280})` }} />
            </div>
            {isSpinning && <div className="absolute inset-0 rounded-full bg-yellow-500/20 blur-2xl animate-pulse" />}
            <motion.div
                className="w-full h-full rounded-full border-[5px] border-yellow-600/50 shadow-2xl relative overflow-hidden bg-[#1a1a2e]"
                animate={{ rotate: rotation }}
                transition={spinMode === 'loading'
                    ? { duration: ROULETTE_LOADING_SPIN_DURATION, ease: [0.2, 0.72, 0.2, 1] }
                    : spinMode === 'settling'
                        ? { duration: spinDuration, ease: [0.16, 0.76, 0.24, 1] }
                        : { duration: 0 }}
                onUpdate={(latest) => {
                    const nextRotate = latest.rotate;
                    if (typeof nextRotate === 'number') {
                        onRotationUpdate?.(nextRotate);
                    }
                }}
                style={{
                    boxShadow: '0 0 30px rgba(234, 179, 8, 0.3), inset 0 0 20px rgba(0,0,0,0.5)',
                    willChange: isSpinning ? 'transform' : 'auto',
                    backfaceVisibility: 'hidden',
                }}
            >
                {ROULETTE_SECTORS.map((sector, index) => {
                    const angle = index * sectorAngle;
                    return (
                        <div key={index} className="absolute w-full h-full top-0 left-0" style={{ transform: `rotate(${angle}deg)` }}>
                            <div className="absolute w-0.5 h-1/2 bg-white/15 top-0 left-1/2 -translate-x-1/2 origin-bottom" />
                            <div className="absolute w-full h-full top-0 left-0" style={{ transform: `rotate(${sectorAngle / 2}deg)` }}>
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center" style={{ height: '40%', transformOrigin: 'bottom center' }}>
                                    <span className="block font-bold drop-shadow-md"
                                        style={{
                                            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                                            color: sector.color,
                                            fontSize: `${Math.max(10, size / 28)}px`
                                        }}>
                                        {sector.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 rounded-full border-3 border-yellow-500 z-10 flex items-center justify-center shadow-lg"
                    style={{ width: size * 0.11, height: size * 0.11 }}>
                    <Star className="text-yellow-500 fill-yellow-500" style={{ width: size * 0.04, height: size * 0.04 }} />
                </div>
            </motion.div>
        </div>
    );
};

const SpinButton = ({
    onClick,
    disabled,
    isSpinning,
    labelIdle,
    labelSpinning,
    scale = 1
}: {
    onClick: () => void;
    disabled: boolean;
    isSpinning: boolean;
    labelIdle: string;
    labelSpinning: string;
    scale?: number
}) => (
    <motion.button
        onClick={onClick}
        disabled={disabled}
        whileHover={{ scale: 1.05 * scale }}
        whileTap={{ scale: 0.95 * scale }}
        style={{ transform: `scale(${scale})` }}
        className={`relative px-8 py-3 rounded-xl font-black text-base tracking-wider transition-all overflow-hidden origin-center
            ${disabled
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-2 border-gray-600'
                : 'bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-400 text-black border-2 border-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.5)]'}`}
    >
        {isSpinning && (
            <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
        )}
        <span className="relative z-10 drop-shadow-md">
            {isSpinning ? labelSpinning : labelIdle}
        </span>
    </motion.button>
);

type RouletteGlobalStats = {
    roulette?: {
        activeUsers?: number;
        totalKIssued?: number;
        totalSpins?: number;
    };
};

function emitRewardOffer(offer: unknown) {
    if (typeof window === 'undefined') return;
    if (!offer || typeof offer !== 'object' || !('id' in offer)) return;
    window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}

export default function RoulettePage() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const { t, localePath } = useI18n();
    const [isSpinning, setIsSpinning] = useState(false);
    const [spinMode, setSpinMode] = useState<'idle' | 'loading' | 'settling'>('idle');
    const [rotation, setRotation] = useState(0);
    const [spinDuration, setSpinDuration] = useState(ROULETTE_SETTLE_DURATION_SEC);
    const [winResult, setWinResult] = useState<{ label: string; type: string; value: number | string } | null>(null);
    const [history, setHistory] = useState<{ label: string; id: number }[]>([]);
    const [spinCounter, setSpinCounter] = useState(1);
    const [todayWins, setTodayWins] = useState({ total: 0, best: 0, count: 0 });
    const [timeUntilReset, setTimeUntilReset] = useState('');
    const [spinsLeft, setSpinsLeft] = useState(3);
    const [nextResetAt, setNextResetAt] = useState<string | null>(null);
    const [globalStats, setGlobalStats] = useState<RouletteGlobalStats | null>(null);
    const [isLandscape, setIsLandscape] = useState(false);
    const [portraitWheelSize, setPortraitWheelSize] = useState(280);
    const [landscapeWheelSize, setLandscapeWheelSize] = useState(280);
    const [windowWidth, setWindowWidth] = useState(0);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
    const rotationRef = useRef(0);
    const spinFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sectorAngle = 360 / ROULETTE_SECTORS.length;

    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);

    useEffect(() => {
        return () => {
            if (spinFinishTimeoutRef.current) {
                clearTimeout(spinFinishTimeoutRef.current);
            }
        };
    }, []);

    // Load history and counter from localStorage
    useEffect(() => {
        if (user?._id) {
            const savedHistory = localStorage.getItem(`roulette_history_${user._id}`);
            const savedCounter = localStorage.getItem(`roulette_counter_${user._id}`);
            if (savedHistory) {
                try {
                    setHistory(JSON.parse(savedHistory));
                } catch (e) {
                    console.error('Error parsing history', e);
                }
            } else {
                setHistory([]);
            }
            if (savedCounter) {
                setSpinCounter(parseInt(savedCounter, 10));
            } else {
                setSpinCounter(1);
            }
        }
    }, [user?._id]);

    // Save history and counter when they change
    useEffect(() => {
        if (user?._id && history.length > 0) {
            localStorage.setItem(`roulette_history_${user._id}`, JSON.stringify(history));
        }
    }, [history, user?._id]);

    useEffect(() => {
        if (user?._id) {
            localStorage.setItem(`roulette_counter_${user._id}`, spinCounter.toString());
        }
    }, [spinCounter, user?._id]);

    // Определяем ориентацию и размер колеса
    useEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setWindowWidth(w);
            const isLand = w > h;
            setIsLandscape(isLand);

            if (isLand) {
                // Landscape: Расчет размера колеса
                const reservedHeight = 180;
                const availableHeight = h - reservedHeight;

                // Ограничение по ширине центральной колонки
                // Grid sides: base/xl = 200px (400px total), 2xl = 350px (700px total)
                // Ads: lg = 160px (320px total), xl = 300px (600px total)

                let sidePanelsWidth = 400; // Base width for info panels
                let adsWidth = 0;
                const nextSideAdSlot = getResponsiveSideAdSlot(w, h);

                if (w >= 1536) { // 2xl
                    sidePanelsWidth = 700;
                    adsWidth = nextSideAdSlot ? (nextSideAdSlot.width * 2) + 32 : 0;
                } else if (w >= 1280) { // xl
                    sidePanelsWidth = 400; // Keep standard 200px panels for safety on 1366/1440
                    adsWidth = nextSideAdSlot ? (nextSideAdSlot.width * 2) + 32 : 0;
                } else if (w >= 1024) { // lg
                    sidePanelsWidth = 400;
                    adsWidth = nextSideAdSlot ? (nextSideAdSlot.width * 2) + 32 : 0;
                }

                const availableWidth = w - sidePanelsWidth - adsWidth - 40; // 40px padding/gaps

                // Размер: минимум от высоты и ширины
                let size = Math.min(availableHeight, availableWidth);
                size = Math.floor(size * 0.9);
                size = Math.max(260, Math.min(size, 850)); // Allow slightly smaller min (260) for tight 1366 screens

                setLandscapeWheelSize(size);
            } else {
                // Portrait (Mobile & Tablet)
                // Расчет фиксированных высот:
                // Header(~50) + InfoGrid(~110) + Button(~60) + BottomBlocks(~220) + Paddings/Gaps(~100)
                const fixedReserved = 540;
                // Roughly estimate ad height for wheel calculation purposes, or just use a safe buffer
                // standard ad is 50-90px. Let's assume 90 to be safe for wheel sizing.
                const estimatedAdHeight = 90;
                const availableWidth = w - 48;

                // Теперь вычисляем размер колеса из оставшегося места
                // We use estimatedAdHeight instead of finalAdHeight since we delegated ad sizing to AdaptiveAdWrapper
                const remainingForWheel = h - fixedReserved - estimatedAdHeight - 30; // 30px для mb-6 и погрешности
                const size = Math.max(200, Math.min(remainingForWheel, availableWidth, 420));
                setPortraitWheelSize(size);
            }
        };
        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    useEffect(() => {
        const updateTimer = () => {
            if (!nextResetAt) return;
            const now = Date.now();
            const reset = new Date(nextResetAt).getTime();
            const diffMs = Math.max(0, reset - now);
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            setTimeUntilReset(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [nextResetAt]);

    const fetchGlobalStats = async () => {
        try {
            const stats = await apiGet<RouletteGlobalStats>('/fortune/stats');
            setGlobalStats(stats);
        } catch (e) { console.error('Error loading global stats:', e); }
    };

    const fetchUserStats = useCallback(async () => {
        try {
            const statusData = await apiGet<unknown>('/fortune/status');
            if (typeof statusData === 'object' && statusData !== null) {
                const spins = 'spinsLeft' in statusData ? Number((statusData as { spinsLeft?: unknown }).spinsLeft) : NaN;
                if (Number.isFinite(spins)) setSpinsLeft(spins);
                const next = 'nextResetAt' in statusData ? (statusData as { nextResetAt?: unknown }).nextResetAt : null;
                if (typeof next === 'string') setNextResetAt(next);
            }

            const userStats = await apiGet<unknown>('/fortune/stats/user');
            const roulette =
                typeof userStats === 'object' && userStats !== null && 'roulette' in userStats
                    ? (userStats as { roulette?: unknown }).roulette
                    : null;
            if (typeof roulette === 'object' && roulette !== null) {
                setTodayWins({
                    total: Number((roulette as { kEarned?: unknown }).kEarned) || 0,
                    best: Number((roulette as { kEarned?: unknown }).kEarned) || 0,
                    count: Number((roulette as { totalSpins?: unknown }).totalSpins) || 0
                });
            }
        } catch (e) { console.error('Error loading user stats:', e); }
    }, []);

    useEffect(() => { fetchGlobalStats(); }, []);
    useEffect(() => { if (user) fetchUserStats(); }, [fetchUserStats, user]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ offerType?: string; result?: { rouletteExtraSpins?: number } }>).detail;
            if (detail?.offerType !== 'roulette_extra_spin' && detail?.offerType !== 'roulette_double_today') return;
            const extraSpins = Number(detail.result?.rouletteExtraSpins);
            if (detail.offerType === 'roulette_extra_spin' && Number.isFinite(extraSpins) && extraSpins > 0) {
                setSpinsLeft((current) => Math.max(current, extraSpins));
            }
            fetchUserStats();
            refreshUser();
        };
        window.addEventListener('givkoin:ad-boost-completed', handler);
        return () => window.removeEventListener('givkoin:ad-boost-completed', handler);
    }, [fetchUserStats, refreshUser]);

    const handleSpin = async () => {
        if (!user || spinsLeft <= 0 || isSpinning) return;
        setIsSpinning(true);
        setSpinMode('loading');
        setWinResult(null);

        if (spinFinishTimeoutRef.current) {
            clearTimeout(spinFinishTimeoutRef.current);
            spinFinishTimeoutRef.current = null;
        }

        const loadingRotationTarget = rotationRef.current + 360;
        setRotation(loadingRotationTarget);

        try {
            const res = await apiPost<unknown>('/fortune/spin', {}, { suppressBoostOffer: true });
            if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
            const winningIndex = Number((res as { sectorIndex?: unknown }).sectorIndex);
            const serverResult = (res as { result?: unknown }).result as { label?: string; type?: string; value?: number | string };
            const remainingSpins = Number((res as { spinsLeft?: unknown }).spinsLeft);
            const resultLabel = typeof serverResult?.label === 'string' ? serverResult.label : '';
            const resultType = typeof serverResult?.type === 'string' ? serverResult.type : 'k';
            const resultValue =
                typeof serverResult?.value === 'number' || typeof serverResult?.value === 'string'
                    ? serverResult.value
                    : 0;

            const safeWinningIndex = Number.isFinite(winningIndex) ? winningIndex : 0;
            const randomOffset = (Math.random() - 0.5) * Math.min(10, sectorAngle * 0.35);
            const targetAngle = (360 - (safeWinningIndex * sectorAngle + sectorAngle / 2) + randomOffset);
            const currentAngle = normalizeRotation(rotationRef.current);
            let angleDiff = targetAngle - currentAngle;
            if (angleDiff < 0) angleDiff += 360;
            const targetRotation = rotationRef.current + (360 * ROULETTE_RESULT_TURNS) + angleDiff;

            rotationRef.current = targetRotation;
            setSpinMode('settling');
            setSpinDuration(ROULETTE_SETTLE_DURATION_SEC);
            setRotation(targetRotation);

            spinFinishTimeoutRef.current = setTimeout(async () => {
                const normalizedRotation = normalizeRotation(targetRotation);
                rotationRef.current = normalizedRotation;
                setIsSpinning(false);
                setSpinMode('idle');
                setSpinDuration(ROULETTE_SETTLE_DURATION_SEC);
                setRotation(normalizedRotation);
                setWinResult({ label: resultLabel, type: resultType, value: resultValue });
                setSpinsLeft(remainingSpins);
                spinFinishTimeoutRef.current = null;

                const currentId = spinCounter;
                setSpinCounter(prev => prev + 1);

                // History: Keep last 3 items, latest at bottom, FIFO
                setHistory(prev => {
                    const newItem = { label: resultLabel, id: currentId };
                    const newHistory = [...prev, newItem];
                    if (newHistory.length > 3) {
                        return newHistory.slice(newHistory.length - 3);
                    }
                    return newHistory;
                });

                if (resultType === 'k') {
                    setTodayWins(prev => ({
                        total: prev.total + (Number(resultValue) || 0),
                        best: Math.max(prev.best, Number(resultValue) || 0),
                        count: prev.count + 1
                    }));
                }
                emitRewardOffer((res as { boostOffer?: unknown }).boostOffer);
                await refreshUser();
                await fetchGlobalStats();
                await fetchUserStats();
            }, ROULETTE_SETTLE_DURATION_MS);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('fortune.spin_error'));
            setIsSpinning(false);
            setSpinMode('idle');
            setSpinDuration(ROULETTE_SETTLE_DURATION_SEC);
        }
    };

    const renderHistoryRows = () => {
        return [0, 1, 2].map((i) => {
            const item = history[i]; // { label, id }
            if (!item) {
                return (
                    <div key={i} className="flex items-center justify-between p-1 2xl:p-2 bg-white/5 border border-white/5 rounded opacity-30">
                        <div className="flex items-center gap-1"><Award className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-gray-500" /><span className="text-caption xl:text-xs 2xl:text-sm text-gray-600">-</span></div>
                        <span className="text-sm xl:text-base 2xl:text-lg text-gray-600 font-bold">-</span>
                    </div>
                );
            }
            return (
                <div key={i} className="flex items-center justify-between p-1 2xl:p-2 bg-white/5 border border-white/10 rounded">
                    <div className="flex items-center gap-1"><Award className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-yellow-400" /><span className="text-caption xl:text-xs 2xl:text-sm text-gray-400">#{item.id}</span></div>
                    <span className="text-sm xl:text-base 2xl:text-lg text-yellow-300 font-bold">{item.label}</span>
                </div>
            );
        });
    };

    // АЛЬБОМНАЯ ориентация (ПК и планшеты в альбомном режиме)
    if (isLandscape) {
        return (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#050510] text-slate-200">
                <div className="fixed inset-0 z-0 pointer-events-none opacity-10">
                    <div className="absolute inset-0 bg-[linear-gradient(30deg,transparent_24%,rgba(250,204,21,0.15)_25%,rgba(250,204,21,0.15)_26%,transparent_27%,transparent_74%,rgba(250,204,21,0.15)_75%,rgba(250,204,21,0.15)_76%,transparent_77%),linear-gradient(-30deg,transparent_24%,rgba(250,204,21,0.15)_25%,rgba(250,204,21,0.15)_26%,transparent_27%,transparent_74%,rgba(250,204,21,0.15)_75%,rgba(250,204,21,0.15)_76%,transparent_77%)] bg-[length:60px_60px]" />
                </div>
                <div className="fixed inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-900/20 via-[#050510] to-[#050510]" />
                </div>

                <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
                    {/* Левый рекламный блок */}
                    <StickySideAdRail
                        adSlot={sideAdSlot}
                        page="fortune/roulette"
                        placement="sidebar"
                        panelClassName="from-yellow-500/5 to-transparent border-yellow-500/10"
                        dividerClassName="border-yellow-500/5"
                    />

                    {/* Центральный контент */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                        {/* Header */}
                        <header className="flex flex-col gap-2 px-4 py-2 2xl:py-4">
                            <div className="flex items-center justify-between gap-3">
                                <Link
                                    href={localePath('/fortune')}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md 2xl:text-base"
                                >
                                    <ArrowLeft className="w-4 h-4 2xl:w-6 2xl:h-6 transition-transform group-hover:-translate-x-1" />
                                    <span className="font-medium">{t('common.back')}</span>
                                </Link>

                                <div className="flex gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 backdrop-blur-md text-tiny 2xl:text-base 2xl:px-5 2xl:py-2">
                                    <div className="flex items-center gap-1 text-yellow-400 font-bold">
                                        <Coins className="w-3.5 h-3.5 2xl:w-5 2xl:h-5" />
                                        <span>{formatUserK(user?.k ?? 0)}</span>
                                    </div>
                                    <div className="w-px bg-white/10" />
                                    <div className="flex items-center gap-1 text-blue-300">
                                        <Star className="w-3.5 h-3.5 2xl:w-5 2xl:h-5 fill-current" />
                                        <span>{user?.stars?.toFixed(2) || '0.00'}</span>
                                    </div>
                                </div>
                            </div>

                            <h1 className="text-h2 font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-orange-500 tracking-tight flex items-center justify-center gap-2 text-center">
                                <Sparkles className="w-5 h-5 2xl:w-8 2xl:h-8 text-yellow-400" />
                                {t('fortune.roulette_title')}
                            </h1>
                        </header>

                        {/* Main Grid */}
                        <div className="flex-1 grid grid-cols-[200px_1fr_200px] 2xl:grid-cols-[350px_1fr_350px] gap-3 px-4 py-2 min-h-0 overflow-hidden items-center">
                            {/* Левая панель */}
                            <div className="flex flex-col gap-2 2xl:gap-4 min-h-0 self-center">
                                <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-lg p-2 2xl:p-4">
                                    <div className="flex items-center justify-between mb-1 2xl:mb-2">
                                        <span className="text-caption xl:text-xs 2xl:text-sm uppercase tracking-wider text-yellow-400/70 font-bold">{t('fortune.tries')}</span>
                                        <RotateCw className={`w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 ${spinsLeft > 0 ? 'text-green-400' : 'text-gray-500'}`} />
                                    </div>
                                    <div className="text-2xl xl:text-3xl 2xl:text-5xl font-black text-yellow-400 font-mono">{spinsLeft}<span className="text-xs xl:text-sm 2xl:text-lg text-gray-500 ml-1">/3</span></div>
                                </div>
                                <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-lg p-2 2xl:p-4">
                                    <div className="flex items-center gap-1 mb-1 2xl:mb-2"><Clock className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-cyan-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-cyan-400/70 font-bold">{t('fortune.until_reset')}</span></div>
                                    <div className="text-lg xl:text-xl 2xl:text-3xl font-bold text-cyan-300 font-mono">{timeUntilReset}</div>
                                </div>
                                <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-lg p-2 2xl:p-4">
                                    <div className="flex items-center gap-1 mb-1 2xl:mb-2"><Gift className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-purple-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-purple-400/70 font-bold">{t('fortune.prizes')}</span></div>
                                    <div className="grid grid-cols-3 gap-1 text-caption xl:text-xs 2xl:text-sm">
                                        <div className="bg-blue-500/20 border border-blue-500/30 rounded px-1 py-0.5 2xl:px-2 2xl:py-1 text-center text-blue-300 font-bold">1-100 K</div>
                                        <div className="bg-cyan-500/20 border border-cyan-500/30 rounded px-1 py-0.5 2xl:px-2 2xl:py-1 text-center text-cyan-300 font-bold">+1</div>
                                        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded px-1 py-0.5 2xl:px-2 2xl:py-1 text-center text-yellow-300 font-bold">0.1⭐</div>
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-lg p-2 2xl:p-4">
                                    <div className="flex items-center gap-1 mb-2 2xl:mb-3"><TrendingUp className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-emerald-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-emerald-400/70 font-bold">{t('fortune.stats')}</span></div>
                                    <div className="space-y-1 text-xs xl:text-sm 2xl:text-base">
                                        <div className="flex justify-between"><span className="text-gray-400">{t('fortune.total')}:</span><span className="text-white font-bold">{todayWins.count}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">{t('fortune.won')}:</span><span className="text-yellow-400 font-bold">{todayWins.total}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">{t('fortune.best')}:</span><span className="text-green-400 font-bold">{todayWins.best}</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* Центр - колесо */}
                            <div className="flex flex-col items-center justify-center gap-6 2xl:gap-10">
                                <WheelComponent
                                    size={landscapeWheelSize}
                                    isSpinning={isSpinning}
                                    rotation={rotation}
                                    spinDuration={spinDuration}
                                    spinMode={spinMode}
                                    onRotationUpdate={(nextRotation) => {
                                        rotationRef.current = nextRotation;
                                    }}
                                />
                                <SpinButton
                                    onClick={handleSpin}
                                    disabled={isSpinning || !user || spinsLeft <= 0}
                                    isSpinning={isSpinning}
                                    labelIdle={t('fortune.spin')}
                                    labelSpinning={t('fortune.spinning')}
                                    scale={Math.max(1, landscapeWheelSize / 350)}
                                />
                            </div>

                            {/* Правая панель */}
                            <div className="flex flex-col gap-2 2xl:gap-4 min-h-0 self-center">
                                <div className="bg-gradient-to-bl from-white/5 to-transparent border border-white/10 rounded-lg p-2 2xl:p-4 flex flex-col min-h-0">
                                    <div className="flex items-center gap-1 mb-2 2xl:mb-3"><Activity className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-cyan-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-cyan-400/70 font-bold">{t('fortune.history')}</span></div>
                                    <div className="space-y-1 overflow-y-auto custom-scrollbar min-h-0 max-h-[160px] 2xl:max-h-[300px]">
                                        {renderHistoryRows()}
                                    </div>
                                </div>
                                <div className="bg-gradient-to-bl from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-2 2xl:p-4">
                                    <div className="flex items-center gap-1 mb-1 2xl:mb-2"><Target className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-emerald-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-emerald-400/70 font-bold">{t('fortune.summary')}</span></div>
                                    <div className="space-y-1 text-xs xl:text-sm 2xl:text-base">
                                        <div className="flex justify-between"><span className="text-gray-400">{t('fortune.players')}:</span><span className="text-white font-bold">{globalStats?.roulette?.activeUsers || 0}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">{t('fortune.paid_out')}:</span><span className="text-yellow-400 font-bold">{(globalStats?.roulette?.totalKIssued || 0).toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">{t('fortune.spins')}:</span><span className="text-cyan-400 font-bold">{(globalStats?.roulette?.totalSpins || 0).toLocaleString()}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Правый рекламный блок */}
                    <StickySideAdRail
                        adSlot={sideAdSlot}
                        page="fortune/roulette"
                        placement="sidebar"
                        panelClassName="from-yellow-500/5 to-transparent border-yellow-500/10"
                        dividerClassName="border-yellow-500/5"
                    />

                    {/* Win Modal */}
                    <AnimatePresence>
                        {winResult && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setWinResult(null)}>
                                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                                    className="relative bg-gradient-to-br from-yellow-900/90 to-orange-900/90 border-2 border-yellow-500/50 rounded-2xl p-8 max-w-sm mx-4 text-center transform scale-125 2xl:scale-150"
                                    onClick={(e) => e.stopPropagation()}>
                                    <div className="text-6xl mb-4">🎉</div>
                                    <div className="text-gray-300 text-sm mb-2 uppercase">{t('fortune.congrats')}</div>
                                    <div className="text-4xl font-black text-yellow-400 mb-6">{winResult.label}</div>
                                    <button onClick={() => setWinResult(null)} className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg text-black font-bold">{t('fortune.great')}</button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <style jsx global>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(250,204,21,0.3); border-radius: 2px; }`}</style>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#050510] text-slate-200">
            <div className="fixed inset-0 z-0 pointer-events-none opacity-10">
                <div className="absolute inset-0 bg-[linear-gradient(30deg,transparent_24%,rgba(250,204,21,0.15)_25%,rgba(250,204,21,0.15)_26%,transparent_27%,transparent_74%,rgba(250,204,21,0.15)_75%,rgba(250,204,21,0.15)_76%,transparent_77%),linear-gradient(-30deg,transparent_24%,rgba(250,204,21,0.15)_25%,rgba(250,204,21,0.15)_26%,transparent_27%,transparent_74%,rgba(250,204,21,0.15)_75%,rgba(250,204,21,0.15)_76%,transparent_77%)] bg-[length:60px_60px]" />
            </div>
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-yellow-900/20 via-[#050510] to-[#050510]" />
            </div>

            <div className={`relative z-10 flex-1 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                {/* Реклама */}
                <div className="w-full mx-auto mt-2 mb-6 flex justify-center">
                    <AdaptiveAdWrapper page="fortune/roulette" placement="inline" strategy="mobile_tablet_adaptive" />
                </div>

                {/* Header */}
                <header className="flex flex-col gap-2 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                        <Link
                            href={localePath('/fortune')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            <span className="font-medium">{t('common.back')}</span>
                        </Link>

                        <div className="flex gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1 backdrop-blur-md text-tiny">
                            <div className="flex items-center gap-1 text-yellow-400 font-bold">
                                <Coins className="w-3 h-3" />
                                <span>{formatUserK(user?.k ?? 0)}</span>
                            </div>
                            <div className="w-px bg-white/10" />
                            <div className="flex items-center gap-1 text-blue-300">
                                <Star className="w-3 h-3 fill-current" />
                                <span>{user?.stars?.toFixed(2) || '0.00'}</span>
                            </div>
                        </div>
                    </div>

                    <h1 className="text-h2 font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-orange-500 tracking-tight flex items-center justify-center gap-2 text-center">
                        <Sparkles className="w-4 h-4 text-yellow-400" />
                        {t('fortune.roulette_title')}
                    </h1>
                </header>

                <div className="p-3 space-y-4">
                    {/* Инфо сетка */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-lg p-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-caption uppercase text-yellow-400/70 font-bold">{t('fortune.tries')}</span>
                                <RotateCw className={`w-3 h-3 ${spinsLeft > 0 ? 'text-green-400' : 'text-gray-500'}`} />
                            </div>
                            <div className="text-2xl font-black text-yellow-400 font-mono">{spinsLeft}<span className="text-xs text-gray-500 ml-1">/3</span></div>
                        </div>
                        <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1"><Clock className="w-3 h-3 text-cyan-400" /><span className="text-caption uppercase text-cyan-400/70 font-bold">{t('fortune.until_reset')}</span></div>
                            <div className="text-lg font-bold text-cyan-300 font-mono">{timeUntilReset}</div>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1"><TrendingUp className="w-3 h-3 text-emerald-400" /><span className="text-caption uppercase text-emerald-400/70 font-bold">{t('fortune.won')}</span></div>
                            <div className="text-lg font-bold text-emerald-300">{todayWins.total} K</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1"><Gift className="w-3 h-3 text-purple-400" /><span className="text-caption uppercase text-purple-400/70 font-bold">{t('fortune.prizes')}</span></div>
                            <div className="flex gap-1 flex-wrap">
                                <span className="text-caption bg-blue-500/20 text-blue-300 px-1 rounded">K</span>
                                <span className="text-caption bg-cyan-500/20 text-cyan-300 px-1 rounded">+1</span>
                                <span className="text-caption bg-yellow-500/20 text-yellow-300 px-1 rounded">⭐</span>
                            </div>
                        </div>
                    </div>

                    {/* Колесо */}
                    <div className="flex flex-col items-center gap-8">
                        <WheelComponent
                            size={portraitWheelSize}
                            isSpinning={isSpinning}
                            rotation={rotation}
                            spinDuration={spinDuration}
                            spinMode={spinMode}
                            onRotationUpdate={(nextRotation) => {
                                rotationRef.current = nextRotation;
                            }}
                        />
                        <SpinButton
                            onClick={handleSpin}
                            disabled={isSpinning || !user || spinsLeft <= 0}
                            isSpinning={isSpinning}
                            labelIdle={t('fortune.spin')}
                            labelSpinning={t('fortune.spinning')}
                        />
                    </div>

                    {/* Нижние блоки */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-gradient-to-bl from-white/5 to-transparent border border-white/10 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-2"><Activity className="w-3 h-3 text-cyan-400" /><span className="text-xs uppercase text-cyan-400/70 font-bold">{t('fortune.history')}</span></div>
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                                {renderHistoryRows()}
                            </div>
                        </div>
                        <div className="bg-gradient-to-bl from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-2"><Target className="w-3 h-3 text-emerald-400" /><span className="text-xs uppercase text-emerald-400/70 font-bold">{t('fortune.summary')}</span></div>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.players')}:</span><span className="text-white font-bold">{globalStats?.roulette?.activeUsers || 0}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.paid_out')}:</span><span className="text-yellow-400 font-bold">{(globalStats?.roulette?.totalKIssued || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.spins')}:</span><span className="text-cyan-400 font-bold">{(globalStats?.roulette?.totalSpins || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.my')}:</span><span className="text-white font-bold">{todayWins.count}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Win Modal */}
            <AnimatePresence>
                {winResult && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setWinResult(null)}>
                        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                            className="relative bg-gradient-to-br from-yellow-900/90 to-orange-900/90 border-2 border-yellow-500/50 rounded-2xl p-8 max-w-sm mx-4 text-center"
                            onClick={(e) => e.stopPropagation()}>
                            <div className="text-6xl mb-4">🎉</div>
                            <div className="text-gray-300 text-sm mb-2 uppercase">{t('fortune.congrats')}</div>
                            <div className="text-4xl font-black text-yellow-400 mb-6">{winResult.label}</div>
                            <button onClick={() => setWinResult(null)} className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg text-black font-bold">{t('fortune.great')}</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(250,204,21,0.3); border-radius: 2px; }`}</style>
        </div >
    );
}

