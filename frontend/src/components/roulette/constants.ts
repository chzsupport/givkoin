import type { RouletteSector } from './types';

export const ROULETTE_SECTORS: RouletteSector[] = [
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

export const ROULETTE_SPIN_DURATION_MS = 6200;
export const ROULETTE_SPIN_DURATION_SEC = ROULETTE_SPIN_DURATION_MS / 1000;
export const ROULETTE_TOTAL_TURNS = 10;
export const ROULETTE_TURNS_PER_STAGE = 2;
export const ROULETTE_PATH_TIMES = [0, 0.24, 0.41, 0.53, 0.70, 1];
export const ROULETTE_PATH_EASING = [
    'linear',
    'linear',
    'linear',
    'linear',
    'linear',
    'linear',
];
