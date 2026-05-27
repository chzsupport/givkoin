import type { RoulettePlannedSpin, RouletteSpinResult } from './types';

export const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;

export function emitRewardOffer(offer: unknown) {
    if (typeof window === 'undefined') return;
    if (!offer || typeof offer !== 'object' || !('id' in offer)) return;
    window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}

export const parseSpinResult = (source: unknown): RouletteSpinResult => {
    const result = source && typeof source === 'object' ? source as { label?: unknown; type?: unknown; value?: unknown } : {};
    return {
        label: typeof result.label === 'string' ? result.label : '',
        type: typeof result.type === 'string' ? result.type : 'k',
        value: typeof result.value === 'number' || typeof result.value === 'string' ? result.value : 0,
    };
};

export const parsePlannedSpins = (source: unknown): RoulettePlannedSpin[] => {
    if (!Array.isArray(source)) return [];
    return source
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const raw = item as { id?: unknown; sectorIndex?: unknown; result?: unknown };
            const sectorIndex = Number(raw.sectorIndex);
            if (!Number.isFinite(sectorIndex)) return null;
            return {
                id: typeof raw.id === 'string' ? raw.id : undefined,
                sectorIndex,
                result: parseSpinResult(raw.result),
            };
        })
        .filter(Boolean) as RoulettePlannedSpin[];
};
