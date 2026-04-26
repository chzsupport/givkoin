'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket, Coins, Star, History, ArrowLeft, Calendar, Trophy } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import { useI18n } from '@/context/I18nContext';
import { useBoost } from '@/context/BoostContext';

// --- ТИПЫ И КОНСТАНТЫ ---
interface LotteryTicket {
    _id: string;
    ticketNumber: string;
    numbers: number[];
    drawDate: string;
    createdAt: string;
}

const parseTicketNumbers = (value: string) => {
    if (!value) return [];
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length === TICKET_LENGTH && value.replace(/\D/g, '').length === value.length) {
        return digitsOnly.split('').map((digit) => Number(digit));
    }
    const matches = value.match(/\d{1,2}/g) || [];
    return matches.map((match) => Number(match));
};

const formatTicketNumbers = (numbers: number[]) => {
    if (!numbers.length) return '';
    const hasTwoDigit = numbers.some((n) => n >= 10);
    if (!hasTwoDigit) return numbers.join('');
    return numbers.map((n) => n.toString().padStart(2, '0')).join(' ');
};

const formatUserSc = (value: number) => {
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

const parseDrawTimeLabel = (value: string) => {
    const [hourRaw, minuteRaw] = String(value || '').split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    return {
        hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 23,
        minute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 59,
    };
};

const getCountdownUntilNextDraw = (value: string, now = new Date()) => {
    const { hour, minute } = parseDrawTimeLabel(value);
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 1);
    }
    return Math.max(0, target.getTime() - now.getTime());
};

const formatCountdown = (value: number | null, loadingLabel: string) => {
    if (value === null) return loadingLabel;
    const totalSeconds = Math.max(0, Math.ceil(value / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
};

const TICKET_LENGTH = 7;
const LOTTERY_MIN_NUMBER = 1;
const LOTTERY_MAX_NUMBER = 49;
const DEFAULT_TICKET_COST = 100;
const DEFAULT_MAX_TICKETS_DAILY = 10;

export default function LotteryPage() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const { localePath, t } = useI18n();
    const boost = useBoost();
    const [ticketSlots, setTicketSlots] = useState<(number | null)[]>(
        Array.from({ length: TICKET_LENGTH }, () => null)
    );
    const [tickets, setTickets] = useState<LotteryTicket[]>([]);
    const [isBuying, setIsBuying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [ticketsToday, setTicketsToday] = useState(0);
    const [drawTimeLabel, setDrawTimeLabel] = useState('23:59');
    const [nextDrawCountdownMs, setNextDrawCountdownMs] = useState<number | null>(null);
    const [maxTicketsPerDay, setMaxTicketsPerDay] = useState(DEFAULT_MAX_TICKETS_DAILY);
    const [ticketCost, setTicketCost] = useState(DEFAULT_TICKET_COST);
    const [prize, setPrize] = useState(0);
    const [lotteryStatus, setLotteryStatus] = useState<string>('open');
    const [windowWidth, setWindowWidth] = useState(0);
    const [windowHeight, setWindowHeight] = useState(0);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
    const isDesktop = Boolean(sideAdSlot);

    const fetchTickets = useCallback(async () => {
        try {
            const data = await apiGet<unknown>('/fortune/lottery/status');
            const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
            const d = isObj(data) ? data : {};
            const ticketsBought = Array.isArray(d.ticketsBought) ? d.ticketsBought : [];
            // Map backend ticket structure to frontend interface
            const mappedTickets = ticketsBought.map((t) => {
                const row = isObj(t) ? t : {};
                const ticketNumberValue = row.ticketNumber;
                const numbersValue = row.numbers;

                const ticket =
                    typeof ticketNumberValue === 'string'
                        ? ticketNumberValue
                        : Array.isArray(numbersValue)
                            ? numbersValue.join(' ')
                            : '';

                const numbers =
                    Array.isArray(numbersValue) && numbersValue.length
                        ? numbersValue.map((n) => Number(n)).filter((n) => Number.isFinite(n))
                        : parseTicketNumbers(ticket);
                return {
                    _id: typeof row._id === 'string' ? row._id : Math.random().toString(36).slice(2),
                    ticketNumber: ticket,
                    numbers,
                    drawDate: typeof row.drawDate === 'string' ? row.drawDate : '',
                    createdAt: typeof row.purchasedAt === 'string' ? row.purchasedAt : ''
                };
            });
            setTickets(mappedTickets);
            setTicketsToday(Number(d.ticketsToday) || 0);
            const resolvedDrawTimeLabel = typeof d.drawTimeLabel === 'string' && d.drawTimeLabel ? d.drawTimeLabel : '23:59';
            const countdownValue = Number(d.nextDrawCountdownMs);
            setDrawTimeLabel(resolvedDrawTimeLabel);
            setNextDrawCountdownMs(
                Number.isFinite(countdownValue)
                    ? Math.max(0, countdownValue)
                    : getCountdownUntilNextDraw(resolvedDrawTimeLabel)
            );
            setMaxTicketsPerDay(Number(d.maxTicketsPerDay) || DEFAULT_MAX_TICKETS_DAILY);
            setTicketCost(Number(d.ticketCost) || DEFAULT_TICKET_COST);
            setPrize(Number(d.prize) || 0);
            setLotteryStatus(typeof d.status === 'string' ? d.status : 'open');
        } catch (e) {
            console.error('Failed to fetch tickets:', e);
            setNextDrawCountdownMs((prev) => prev ?? getCountdownUntilNextDraw('23:59'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    useEffect(() => {
        const updateLayout = () => {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    useEffect(() => {
        setNextDrawCountdownMs((prev) => prev ?? getCountdownUntilNextDraw(drawTimeLabel));
    }, [drawTimeLabel]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setNextDrawCountdownMs((prev) => {
                if (prev === null) return prev;
                if (prev <= 1000) return 0;
                return prev - 1000;
            });
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (nextDrawCountdownMs !== 0) return;
        const timeoutId = window.setTimeout(() => {
            fetchTickets();
        }, 1500);
        return () => window.clearTimeout(timeoutId);
    }, [nextDrawCountdownMs, fetchTickets]);

    const handleBuyTicket = async () => {
        const selectedNumbers = ticketSlots.filter((value): value is number => value !== null);
        if (selectedNumbers.length !== TICKET_LENGTH) {
            toast.error(t('common.error'), t('fortune.lottery_pick_7_numbers'));
            return;
        }
        if (!user || ticketsToday >= maxTicketsPerDay) return;
        if (user.sc < ticketCost) return;

        setIsBuying(true);
        try {
            await apiPost('/fortune/lottery/buy', { numbers: selectedNumbers });
            setTicketSlots(Array.from({ length: TICKET_LENGTH }, () => null));
            toast.success(t('fortune.ticket_purchased'), t('fortune.lottery_good_luck'));
            refreshUser();
            fetchTickets();

            boost.offerBoost({
                type: 'lottery_free_ticket',
                label: t('boost.lottery_free_ticket.label'),
                description: t('boost.lottery_free_ticket.description'),
                rewardText: t('boost.lottery_free_ticket.reward'),
                onReward: () => {
                    apiPost('/boost/claim', { type: 'lottery_free_ticket' }).then((res: unknown) => {
                        const data = res as { ok?: boolean } | null;
                        if (data?.ok) {
                            refreshUser();
                            fetchTickets();
                        }
                    }).catch(() => {});
                },
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('fortune.lottery_buy_error'));
        } finally {
            setIsBuying(false);
        }
    };


    const handleRandomSelect = () => {
        const pool = Array.from({ length: LOTTERY_MAX_NUMBER }, (_, index) => index + LOTTERY_MIN_NUMBER);
        const shuffled = pool.sort(() => Math.random() - 0.5);
        setTicketSlots(shuffled.slice(0, TICKET_LENGTH));
    };

    const handleSlotChange = (index: number, rawValue: string) => {
        const digits = rawValue.replace(/\D/g, '').slice(0, 2);
        if (!digits) {
            setTicketSlots((prev) => {
                const next = [...prev];
                next[index] = null;
                return next;
            });
            return;
        }
        const value = Number(digits);
        if (Number.isNaN(value) || value < LOTTERY_MIN_NUMBER || value > LOTTERY_MAX_NUMBER) {
            return;
        }
        setTicketSlots((prev) => {
            const next = [...prev];
            const existingIndex = next.findIndex((num, slotIndex) => num === value && slotIndex !== index);
            if (existingIndex !== -1) {
                next[existingIndex] = null;
            }
            next[index] = value;
            return next;
        });
    };

    const handleNumberToggle = (value: number) => {
        setTicketSlots((prev) => {
            const next = [...prev];
            const existingIndex = next.findIndex((num) => num === value);
            if (existingIndex !== -1) {
                next[existingIndex] = null;
                return next;
            }
            const emptyIndex = next.findIndex((num) => num === null);
            if (emptyIndex === -1) {
                return next;
            }
            next[emptyIndex] = value;
            return next;
        });
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#050510] text-slate-200 font-sans selection:bg-blue-500/30">
            {/* Фон */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#050510] to-[#050510]" />
                <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
            </div>

            {/* Основной контейнер */}
            <div className="relative z-10 flex flex-1 min-h-0">
                {/* Левый рекламный блок */}
                <StickySideAdRail
                    adSlot={sideAdSlot}
                    page="fortune/lottery"
                    placement="sidebar"
                    panelClassName="from-blue-500/5 to-transparent border-blue-500/10"
                    dividerClassName="border-blue-500/5"
                />

                {/* Центральный контент */}
                <div className="flex-1 flex flex-col min-w-0 px-2 xl:px-3 py-2 min-h-0">
                    {/* MOBILE AD BLOCK - mobile banner */}
                    <div className={`${isDesktop ? 'hidden' : 'flex'} w-full mb-4 shrink-0 mx-auto justify-center`}>
                        <AdaptiveAdWrapper page="fortune/lottery" placement="inline" strategy="mobile_tablet_adaptive" />
                    </div>

                    {/* Хедер */}
                    <header className="flex flex-col gap-2 mb-2 flex-shrink-0">
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
                                    <span>{formatUserSc(user?.sc ?? 0)}</span>
                                </div>
                                <div className="w-px bg-white/10" />
                                <div className="flex items-center gap-1 text-blue-300">
                                    <Star className="w-3 h-3 fill-current" />
                                    <span>{user?.stars?.toFixed(2) || '0.00'}</span>
                                </div>
                            </div>
                        </div>

                        <h1 className="text-h2 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-blue-400 to-purple-500 tracking-tight flex items-center justify-center gap-2 text-center">
                            <Ticket className="w-4 h-4 xl:w-5 xl:h-5 text-blue-400" />
                            {t('fortune.lottery_title')}
                        </h1>
                    </header>

                    {/* Контент */}
                    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-1.5 xl:gap-2">

                        {/* Левая часть — Выбор чисел */}
                        <div className="xl:col-span-7 flex flex-col xl:min-h-0">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-2 flex flex-col xl:flex-1 xl:min-h-0">
                                <div className="flex justify-between items-center mb-1.5 flex-shrink-0">
                                    <div>
                                        <h3 className="text-secondary font-bold text-white flex items-center gap-1">
                                            <Ticket className="w-3 h-3 xl:w-4 xl:h-4 text-blue-400" />
                                            {t('fortune.ticket')}
                                        </h3>
                                        <p className="text-tiny text-gray-400">{t('fortune.lottery_choose_7_1_49')}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-tiny text-gray-400">{t('fortune.cost')}</div>
                                        <div className="text-secondary font-bold text-yellow-400">{ticketCost} K</div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 mb-1 xl:flex-1 xl:min-h-0">
                                    <div className="grid grid-cols-7 gap-1">
                                        {Array.from({ length: TICKET_LENGTH }).map((_, i) => (
                                            <input
                                                key={i}
                                                type="text"
                                                inputMode="numeric"
                                                value={ticketSlots[i] ?? ''}
                                                onChange={(e) => handleSlotChange(i, e.target.value)}
                                                placeholder="–"
                                                className="h-8 rounded-md border border-white/10 bg-white/5 text-white text-center text-tiny font-bold font-mono outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                                            />
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 grid-rows-7 gap-0.5 sm:gap-1 xl:gap-1.5 max-h-none overflow-visible custom-scrollbar flex-1 xl:min-h-0">
                                        {Array.from({ length: LOTTERY_MAX_NUMBER }).map((_, index) => {
                                            const value = index + LOTTERY_MIN_NUMBER;
                                            const isSelected = ticketSlots.includes(value);
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => handleNumberToggle(value)}
                                                    className={`w-full h-full aspect-square xl:aspect-auto rounded-md text-tiny font-bold border transition-all flex items-center justify-center
                                                        ${isSelected
                                                            ? 'border-blue-400 bg-blue-500/30 text-blue-200'
                                                            : 'border-white/10 bg-black/20 text-gray-400 hover:border-blue-500/40 hover:text-blue-200'}
                                                    `}
                                                >
                                                    {value}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-between items-center gap-1.5 border-t border-white/10 pt-1.5 flex-shrink-0">
                                    <div className="text-tiny text-gray-500">
                                        {t('fortune.selected')}: {ticketSlots.filter((value) => value !== null).length}/{TICKET_LENGTH}
                                    </div>

                                    <div className="flex gap-2 items-center">
                                        <button
                                            onClick={handleRandomSelect}
                                            className="px-3 xl:px-4 py-1.5 rounded-lg font-bold text-tiny bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/30 transition-all"
                                        >
                                            🎲 {t('fortune.random')}
                                        </button>
                                        <button
                                            onClick={handleBuyTicket}
                                            disabled={ticketSlots.filter((value) => value !== null).length !== TICKET_LENGTH || ticketsToday >= maxTicketsPerDay || (user?.sc || 0) < ticketCost || isBuying || lotteryStatus !== 'open'}
                                            className={`
                                                px-3 xl:px-4 py-1.5 rounded-lg font-bold text-tiny transition-all
                                                ${ticketSlots.filter((value) => value !== null).length === TICKET_LENGTH && ticketsToday < maxTicketsPerDay && (user?.sc || 0) >= ticketCost && lotteryStatus === 'open'
                                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.25)]'
                                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                                            `}
                                        >
                                            {isBuying ? '...' : lotteryStatus !== 'open' ? t('fortune.closed') : ticketsToday >= maxTicketsPerDay ? t('fortune.limit_title') : t('fortune.buy_ticket')}
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-1 flex justify-between text-tiny text-gray-500 flex-shrink-0">
                                    <span>{t('fortune.tickets')}: {ticketsToday}/{maxTicketsPerDay}</span>
                                    <span>{t('fortune.prize_today')}: {prize.toLocaleString()} K</span>
                                </div>
                            </div>
                        </div>

                        {/* Правая часть */}
                        <div className="xl:col-span-5 flex flex-col gap-2 xl:min-h-0">
                            <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
                                <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/20 border border-blue-500/30 rounded-xl p-1.5 xl:p-2">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <Calendar className="w-3 h-3 text-blue-400" />
                                        <span className="text-blue-300 font-bold text-tiny">{t('fortune.draw')}</span>
                                    </div>
                                    <div className="text-caption text-blue-100/70">
                                        {t('fortune.daily_at')} {drawTimeLabel}
                                    </div>
                                    <div className="text-sm xl:text-base font-semibold text-white tabular-nums">
                                        {formatCountdown(nextDrawCountdownMs, t('common.loading'))}
                                    </div>
                                    <div className="text-label text-blue-200/50">
                                        {lotteryStatus === 'open' ? t('fortune.until_draw') : t('fortune.until_next')}
                                    </div>
                                </div>

                                <div className="bg-white/5 border border-white/10 rounded-xl p-1.5 xl:p-2">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <Trophy className="w-3 h-3 text-yellow-400" />
                                        <span className="text-white font-bold text-tiny">{t('fortune.prizes')}</span>
                                    </div>
                                    <div className="text-tiny text-gray-400">3→150 | 4→300 | 5→600 | 6→900 | 7→1K</div>
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-xl p-1.5 xl:p-2 flex flex-col xl:flex-1 xl:min-h-0">
                                <h4 className="text-white font-bold text-tiny flex items-center gap-1 mb-1 flex-shrink-0">
                                    <History className="w-3 h-3 text-gray-400" />
                                    {t('fortune.tickets')} ({tickets.length})
                                </h4>

                                {loading ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                                    </div>
                                ) : tickets.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-tiny text-center">
                                        <Ticket className="w-5 h-5 mb-1 opacity-20" />
                                        {t('fortune.no_tickets')}
                                    </div>
                                ) : (
                                    <div className="max-h-[320px] xl:max-h-[360px] overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                                        {tickets.map((ticket) => (
                                            <div key={ticket._id} className="bg-black/40 border border-white/5 rounded-lg p-1.5">
                                                <div className="flex justify-between text-tiny text-gray-500 mb-0.5">
                                                    <span>#{formatTicketNumbers(ticket.numbers) || ticket.ticketNumber}</span>
                                                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <div className="flex gap-0.5 flex-wrap">
                                                    {ticket.numbers.map((n) => (
                                                        <span
                                                            key={n}
                                                            className="min-w-[1.6rem] h-5 xl:h-6 rounded text-tiny flex items-center justify-center font-mono bg-blue-900/50 text-blue-200 px-1"
                                                        >
                                                            {n.toString().padStart(2, '0')}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Правый рекламный блок */}
                <StickySideAdRail
                    adSlot={sideAdSlot}
                    page="fortune/lottery"
                    placement="sidebar"
                    panelClassName="from-blue-500/5 to-transparent border-blue-500/10"
                    dividerClassName="border-blue-500/5"
                />
            </div>


            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}

