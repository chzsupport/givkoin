'use client';

import { useEffect, useState } from 'react';
import {
    BATTLE_REFERENCE_HEIGHT,
    BATTLE_REFERENCE_WIDTH,
} from './battleLayout';

export type BattlePerformanceTier = 'low' | 'medium' | 'high';

export function useBattleEnvironment() {
    const [performanceTier, setPerformanceTier] = useState<BattlePerformanceTier>('high');
    const [useMobileBattleVideos, setUseMobileBattleVideos] = useState(false);
    const [isTabVisible, setIsTabVisible] = useState(true);
    const [isBrowserOnline, setIsBrowserOnline] = useState(
        typeof window === 'undefined' ? true : window.navigator.onLine,
    );
    const [viewportSize, setViewportSize] = useState({
        width: BATTLE_REFERENCE_WIDTH,
        height: BATTLE_REFERENCE_HEIGHT,
    });

    useEffect(() => {
        const detectTier = () => {
            const safeWidth = window.innerWidth || BATTLE_REFERENCE_WIDTH;
            const safeHeight = window.innerHeight || BATTLE_REFERENCE_HEIGHT;
            setViewportSize({
                width: safeWidth,
                height: safeHeight,
            });
            const nav = navigator as Navigator & { deviceMemory?: number };
            const memory = Number(nav.deviceMemory || 0);
            const cores = Number(nav.hardwareConcurrency || 0);
            const maxTouchPoints = Number(nav.maxTouchPoints || 0);
            const hasCoarsePointer = typeof window.matchMedia === 'function'
                ? window.matchMedia('(pointer: coarse)').matches
                : false;
            const isTouchDevice = maxTouchPoints > 0 || hasCoarsePointer;
            const longestSide = Math.max(safeWidth, safeHeight);
            const isMobileBattleDevice = Boolean(isTouchDevice && longestSide <= 1400);
            setUseMobileBattleVideos(isMobileBattleDevice);

            if ((memory > 0 && memory <= 4) || (cores > 0 && cores <= 4)) {
                setPerformanceTier('low');
                return;
            }
            if (isMobileBattleDevice || (memory > 0 && memory <= 8) || (cores > 0 && cores <= 8)) {
                setPerformanceTier('medium');
                return;
            }
            setPerformanceTier('high');
        };

        detectTier();
        window.addEventListener('resize', detectTier);
        return () => window.removeEventListener('resize', detectTier);
    }, []);

    useEffect(() => {
        const syncVisibility = () => {
            setIsTabVisible(document.visibilityState !== 'hidden');
        };
        syncVisibility();
        document.addEventListener('visibilitychange', syncVisibility);
        return () => document.removeEventListener('visibilitychange', syncVisibility);
    }, []);

    useEffect(() => {
        const syncOnlineState = () => {
            const nextOnline = typeof window === 'undefined' ? true : window.navigator.onLine;
            setIsBrowserOnline(nextOnline);
        };

        syncOnlineState();
        window.addEventListener('online', syncOnlineState);
        window.addEventListener('offline', syncOnlineState);
        return () => {
            window.removeEventListener('online', syncOnlineState);
            window.removeEventListener('offline', syncOnlineState);
        };
    }, []);

    return {
        performanceTier,
        useMobileBattleVideos,
        isTabVisible,
        isBrowserOnline,
        viewportSize,
    };
}
