import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import type { FortuneStats } from './types';

const isObj = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function emitFortuneRewardOffer(offer: unknown) {
    if (typeof window === 'undefined') return;
    if (!offer || typeof offer !== 'object' || !('id' in offer)) return;
    window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}

export function formatFortuneK(value: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    const whole = Math.floor(n);
    const frac = n - whole;
    const normalized = frac >= 0.59 ? whole + 1 : frac > 0 ? whole + 0.5 : whole;
    return new Intl.NumberFormat(getSiteLanguageLocale(getSiteLanguage()), {
        minimumFractionDigits: normalized % 1 === 0 ? 0 : 1,
        maximumFractionDigits: 1,
    }).format(normalized);
}

export function mapFortuneStats(source: unknown): FortuneStats {
    const data = isObj(source) ? source : {};
    const world = isObj(data.world) ? data.world : {};
    const roulette = isObj(data.roulette) ? data.roulette : {};

    return {
        totalPlayers: (Number(world.totalFortunePlayers) || 0) + (Number(world.totalLotteryPlayers) || 0),
        totalWins: Number(roulette.totalSpins) || 0,
        jackpotsThisMonth: Number(world.maxFortuneWin) || 0,
        avgDailyPlayers: Number(roulette.activeUsers) || 0,
        leaderboard: (Array.isArray(roulette.topSpinners) ? roulette.topSpinners : []).slice(0, 5).map((item, index: number) => {
            const row = isObj(item) ? item : {};
            const name = typeof row.nickname === 'string' ? row.nickname.trim() : '';
            return {
                rank: index + 1,
                name,
                wins: Number(row.totalSpins) || 0,
            };
        }).filter((row) => row.name),
        recentWinners: (Array.isArray(roulette.recentActivity) ? roulette.recentActivity : []).map((item) => {
            const row = isObj(item) ? item : {};
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
}

export function isFortuneRecord(value: unknown): value is Record<string, unknown> {
    return isObj(value);
}
