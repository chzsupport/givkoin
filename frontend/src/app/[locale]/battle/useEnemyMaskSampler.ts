'use client';

import { useCallback, useEffect, useRef } from 'react';

type MaskSampler = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
};

type SilhouettePoint = {
    localX: number;
    localY: number;
} | null;

type UseEnemyMaskSamplerParams = {
    silhouetteSrc: string;
    mapPointToSilhouette: (worldX: number, worldY: number) => SilhouettePoint;
};

export function useEnemyMaskSampler({ silhouetteSrc, mapPointToSilhouette }: UseEnemyMaskSamplerParams) {
    const maskSamplerRef = useRef<MaskSampler | null>(null);

    useEffect(() => {
        let cancelled = false;
        const img = new Image();
        img.src = silhouetteSrc;
        img.onload = () => {
            if (cancelled) return;
            const naturalWidth = img.naturalWidth || img.width || 1440;
            const naturalHeight = img.naturalHeight || img.height || 735;
            if (naturalWidth === 0 || naturalHeight === 0) {
                maskSamplerRef.current = null;
                return;
            }
            const canvas = document.createElement('canvas');
            canvas.width = naturalWidth;
            canvas.height = naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                maskSamplerRef.current = null;
                return;
            }
            ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
            const imageData = ctx.getImageData(0, 0, naturalWidth, naturalHeight);
            maskSamplerRef.current = {
                width: naturalWidth,
                height: naturalHeight,
                data: imageData.data,
            };
        };
        img.onerror = () => {
            if (!cancelled) maskSamplerRef.current = null;
        };
        return () => {
            cancelled = true;
        };
    }, [silhouetteSrc]);

    const isPointInsideSilhouette = useCallback((worldX: number, worldY: number) => {
        const sampler = maskSamplerRef.current;
        if (!sampler) return false;
        const { width, height, data } = sampler;

        const point = mapPointToSilhouette(worldX, worldY);
        if (!point) return false;

        const px = Math.min(width - 1, Math.max(0, Math.round(point.localX * (width - 1))));
        const py = Math.min(height - 1, Math.max(0, Math.round((1 - point.localY) * (height - 1))));

        const index = (py * width + px) * 4;
        const alpha = data[index + 3];

        return alpha > 16;
    }, [mapPointToSilhouette]);

    const isPointInsideMask = useCallback((worldX: number, worldY: number) => {
        return isPointInsideSilhouette(worldX, worldY);
    }, [isPointInsideSilhouette]);

    return {
        isPointInsideMask,
        isPointInsideSilhouette,
    };
}
