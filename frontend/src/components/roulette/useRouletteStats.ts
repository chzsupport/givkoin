'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/utils/api';
import { parsePlannedSpins } from './rouletteUtils';
import type { RouletteGlobalStats, RoulettePlannedSpin, RouletteTodayWins } from './types';

export function useRouletteStats({
    refreshUser,
    user,
}: {
    refreshUser: () => Promise<void>;
    user: unknown;
}) {
    const [todayWins, setTodayWins] = useState<RouletteTodayWins>({ total: 0, best: 0, count: 0 });
    const [spinsLeft, setSpinsLeft] = useState(3);
    const [plannedSpins, setPlannedSpins] = useState<RoulettePlannedSpin[]>([]);
    const [nextResetAt, setNextResetAt] = useState<string | null>(null);
    const [globalStats, setGlobalStats] = useState<RouletteGlobalStats | null>(null);

    const fetchGlobalStats = useCallback(async () => {
        try {
            const stats = await apiGet<RouletteGlobalStats>('/fortune/stats');
            setGlobalStats(stats);
        } catch (e) {
            console.error('Error loading global stats:', e);
        }
    }, []);

    const fetchUserStats = useCallback(async () => {
        try {
            const statusData = await apiGet<unknown>('/fortune/status');
            if (typeof statusData === 'object' && statusData !== null) {
                const spins = 'spinsLeft' in statusData ? Number((statusData as { spinsLeft?: unknown }).spinsLeft) : NaN;
                if (Number.isFinite(spins)) setSpinsLeft(spins);
                const next = 'nextResetAt' in statusData ? (statusData as { nextResetAt?: unknown }).nextResetAt : null;
                if (typeof next === 'string') setNextResetAt(next);
                const planned = 'plannedSpins' in statusData ? (statusData as { plannedSpins?: unknown }).plannedSpins : [];
                setPlannedSpins(parsePlannedSpins(planned));
            }

            const userStats = await apiGet<unknown>('/fortune/stats/user');
            const roulette =
                typeof userStats === 'object' && userStats !== null && 'roulette' in userStats
                    ? (userStats as { roulette?: unknown }).roulette
                    : null;
            if (typeof roulette === 'object' && roulette !== null) {
                const kEarned = Number((roulette as { kEarned?: unknown }).kEarned) || 0;
                setTodayWins({
                    total: kEarned,
                    best: kEarned,
                    count: Number((roulette as { totalSpins?: unknown }).totalSpins) || 0,
                });
            }
        } catch (e) {
            console.error('Error loading user stats:', e);
        }
    }, []);

    useEffect(() => {
        fetchGlobalStats();
    }, [fetchGlobalStats]);

    useEffect(() => {
        if (user) fetchUserStats();
    }, [fetchUserStats, user]);

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

    return {
        fetchGlobalStats,
        fetchUserStats,
        globalStats,
        nextResetAt,
        plannedSpins,
        setPlannedSpins,
        setSpinsLeft,
        setTodayWins,
        spinsLeft,
        todayWins,
    };
}
