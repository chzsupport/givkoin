import {
    DEFAULT_MAX_TICKETS_DAILY,
    DEFAULT_TICKET_COST,
    TICKET_LENGTH,
} from './constants';
import type { LotteryStatusSnapshot, LotteryTicket } from './types';

const isObj = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function parseTicketNumbers(value: string) {
    if (!value) return [];
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length === TICKET_LENGTH && digitsOnly.length === value.length) {
        return digitsOnly.split('').map((digit) => Number(digit));
    }
    const matches = value.match(/\d{1,2}/g) || [];
    return matches.map((match) => Number(match));
}

export function formatTicketNumbers(numbers: number[]) {
    if (!numbers.length) return '';
    const hasTwoDigit = numbers.some((n) => n >= 10);
    if (!hasTwoDigit) return numbers.join('');
    return numbers.map((n) => n.toString().padStart(2, '0')).join(' ');
}

export function parseDrawTimeLabel(value: string) {
    const [hourRaw, minuteRaw] = String(value || '').split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    return {
        hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 23,
        minute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 59,
    };
}

export function getCountdownUntilNextDraw(value: string, now = new Date()) {
    const { hour, minute } = parseDrawTimeLabel(value);
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 1);
    }
    return Math.max(0, target.getTime() - now.getTime());
}

export function formatLotteryCountdown(value: number | null, loadingLabel: string) {
    if (value === null) return loadingLabel;
    const totalSeconds = Math.max(0, Math.ceil(value / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
}

export function mapLotteryStatusResponse(source: unknown): LotteryStatusSnapshot {
    const data = isObj(source) ? source : {};
    const ticketsBought = Array.isArray(data.ticketsBought) ? data.ticketsBought : [];
    const drawTimeLabel = typeof data.drawTimeLabel === 'string' && data.drawTimeLabel ? data.drawTimeLabel : '23:59';
    const countdownValue = Number(data.nextDrawCountdownMs);

    return {
        tickets: ticketsBought.map(mapLotteryTicket),
        ticketsToday: Number(data.ticketsToday) || 0,
        drawTimeLabel,
        nextDrawCountdownMs: Number.isFinite(countdownValue)
            ? Math.max(0, countdownValue)
            : getCountdownUntilNextDraw(drawTimeLabel),
        maxTicketsPerDay: Number(data.maxTicketsPerDay) || DEFAULT_MAX_TICKETS_DAILY,
        ticketCost: Number(data.ticketCost) || DEFAULT_TICKET_COST,
        freeTickets: Math.max(0, Math.floor(Number(data.freeTickets) || 0)),
        prize: Number(data.prize) || 0,
        status: typeof data.status === 'string' ? data.status : 'open',
    };
}

function mapLotteryTicket(source: unknown): LotteryTicket {
    const row = isObj(source) ? source : {};
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
            ? numbersValue.map((value) => Number(value)).filter((value) => Number.isFinite(value))
            : parseTicketNumbers(ticket);

    return {
        _id: typeof row._id === 'string' ? row._id : Math.random().toString(36).slice(2),
        ticketNumber: ticket,
        numbers,
        drawDate: typeof row.drawDate === 'string' ? row.drawDate : '',
        createdAt: typeof row.purchasedAt === 'string' ? row.purchasedAt : '',
    };
}
