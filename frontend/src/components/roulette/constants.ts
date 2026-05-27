import type { RouletteSector } from './types';

export const ROULETTE_SECTORS: RouletteSector[] = [
    { label: '1', value: 1, type: 'k', color: '#7F1024' },
    { label: '5', value: 5, type: 'k', color: '#101521' },
    { label: '10', value: 10, type: 'k', color: '#8E1328' },
    { label: '15', value: 15, type: 'k', color: '#131927' },
    { label: '20', value: 20, type: 'k', color: '#9B182E' },
    { label: '30', value: 30, type: 'k', color: '#161D2D' },
    { label: '40', value: 40, type: 'k', color: '#A51C34' },
    { label: '50', value: 50, type: 'k', color: '#182234' },
    { label: '60', value: 60, type: 'k', color: '#B0223A' },
    { label: '70', value: 70, type: 'k', color: '#1B2638' },
    { label: '80', value: 80, type: 'k', color: '#BC2A42' },
    { label: '90', value: 90, type: 'k', color: '#1D2B40' },
    { label: '100', value: 100, type: 'k', color: '#C89B2C' },
    { label: '+1', value: 0, type: 'spin', color: '#0F766E' },
    { label: '0.1⭐', value: 0.1, type: 'star', color: '#D7A928' },
];

export const ROULETTE_SPIN_DURATION_MS = 5200;
export const ROULETTE_TOTAL_TURNS = 2;
export const ROULETTE_ACCELERATION_SHARE = 0.24;
export const ROULETTE_COAST_SHARE = 0.34;
export const ROULETTE_DECELERATION_SHARE = 0.42;
