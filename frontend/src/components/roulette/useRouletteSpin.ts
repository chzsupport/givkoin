'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { apiPost } from '@/utils/api';
import {
    ROULETTE_SECTORS,
    ROULETTE_SPIN_DURATION_MS,
    ROULETTE_TOTAL_TURNS,
    ROULETTE_TURNS_PER_STAGE,
} from './constants';
import { emitRewardOffer, normalizeRotation, parseSpinResult } from './rouletteUtils';
import type { RoulettePlannedSpin, RouletteSpinMode, RouletteSpinResult, RouletteTodayWins } from './types';

type RouletteToast = {
    error: (title: string, message?: string) => void;
};

export function useRouletteSpin({
    fetchGlobalStats,
    fetchUserStats,
    plannedSpins,
    recordSpinHistory,
    refreshUser,
    setPlannedSpins,
    setSpinsLeft,
    setTodayWins,
    spinsLeft,
    t,
    toast,
    user,
}: {
    fetchGlobalStats: () => Promise<void>;
    fetchUserStats: () => Promise<void>;
    plannedSpins: RoulettePlannedSpin[];
    recordSpinHistory: (label: string) => void;
    refreshUser: () => Promise<void>;
    setPlannedSpins: Dispatch<SetStateAction<RoulettePlannedSpin[]>>;
    setSpinsLeft: Dispatch<SetStateAction<number>>;
    setTodayWins: Dispatch<SetStateAction<RouletteTodayWins>>;
    spinsLeft: number;
    t: (key: string) => string;
    toast: RouletteToast;
    user: unknown;
}) {
    const [isSpinning, setIsSpinning] = useState(false);
    const [spinMode, setSpinMode] = useState<RouletteSpinMode>('idle');
    const [rotation, setRotation] = useState(0);
    const [rotationPath, setRotationPath] = useState<number[] | null>(null);
    const [winResult, setWinResult] = useState<RouletteSpinResult | null>(null);
    const rotationRef = useRef(0);
    const spinAnimationPromiseRef = useRef<Promise<number> | null>(null);
    const spinAnimationResolveRef = useRef<((rotation: number) => void) | null>(null);
    const spinAnimationSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sectorAngle = 360 / ROULETTE_SECTORS.length;

    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);

    useEffect(() => {
        return () => {
            if (spinAnimationSafetyTimeoutRef.current) {
                clearTimeout(spinAnimationSafetyTimeoutRef.current);
            }
        };
    }, []);

    const handleRotationUpdate = useCallback((nextRotation: number) => {
        rotationRef.current = nextRotation;
    }, []);

    const handleSpinComplete = useCallback((finalRotation: number) => {
        rotationRef.current = finalRotation;
        if (spinAnimationSafetyTimeoutRef.current) {
            clearTimeout(spinAnimationSafetyTimeoutRef.current);
            spinAnimationSafetyTimeoutRef.current = null;
        }
        const resolve = spinAnimationResolveRef.current;
        spinAnimationResolveRef.current = null;
        if (resolve) {
            resolve(finalRotation);
        }
    }, []);

    const startWheelAnimation = useCallback((winningIndex: number) => {
        const safeWinningIndex = Number.isFinite(winningIndex) ? winningIndex : 0;
        const randomOffset = (Math.random() - 0.5) * Math.min(10, sectorAngle * 0.35);
        const targetAngle = (360 - (safeWinningIndex * sectorAngle + sectorAngle / 2) + randomOffset);
        const currentAngle = normalizeRotation(rotationRef.current);
        let angleDiff = targetAngle - currentAngle;
        if (angleDiff < 0) angleDiff += 360;
        const startRotation = rotationRef.current;
        const stageRotation = 360 * ROULETTE_TURNS_PER_STAGE;
        const targetRotation = startRotation + (360 * ROULETTE_TOTAL_TURNS) + angleDiff;
        const path = [
            startRotation,
            startRotation + stageRotation,
            startRotation + stageRotation * 2,
            startRotation + stageRotation * 3,
            startRotation + stageRotation * 4,
            targetRotation,
        ];

        rotationRef.current = targetRotation;
        if (spinAnimationSafetyTimeoutRef.current) {
            clearTimeout(spinAnimationSafetyTimeoutRef.current);
        }
        spinAnimationPromiseRef.current = new Promise((resolve) => {
            spinAnimationResolveRef.current = resolve;
            spinAnimationSafetyTimeoutRef.current = setTimeout(() => {
                spinAnimationSafetyTimeoutRef.current = null;
                spinAnimationResolveRef.current = null;
                resolve(targetRotation);
            }, ROULETTE_SPIN_DURATION_MS + 900);
        });
        setRotationPath(path);
        setRotation(startRotation);
        return targetRotation;
    }, [sectorAngle]);

    const finishSpinAfterAnimation = useCallback(async (
        spinResponsePromise: Promise<{ res: unknown } | { error: unknown }>,
        targetRotation: number | null,
    ) => {
        const [spinResponse, finalRotation] = await Promise.all([
            spinResponsePromise,
            spinAnimationPromiseRef.current || Promise.resolve(targetRotation || rotationRef.current),
        ]);
        if ('error' in spinResponse) throw spinResponse.error;
        const res = spinResponse.res;
        if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
        const serverResult = parseSpinResult((res as { result?: unknown }).result);
        const remainingSpins = Number((res as { spinsLeft?: unknown }).spinsLeft);
        const normalizedRotation = normalizeRotation(finalRotation || targetRotation || rotationRef.current);
        rotationRef.current = normalizedRotation;
        spinAnimationPromiseRef.current = null;
        setIsSpinning(false);
        setSpinMode('idle');
        setRotationPath(null);
        setRotation(normalizedRotation);
        setWinResult(serverResult);
        if (Number.isFinite(remainingSpins)) setSpinsLeft(remainingSpins);
        setPlannedSpins((current) => current.slice(1));

        recordSpinHistory(serverResult.label);

        if (serverResult.type === 'k') {
            setTodayWins((prev) => ({
                total: prev.total + (Number(serverResult.value) || 0),
                best: Math.max(prev.best, Number(serverResult.value) || 0),
                count: prev.count + 1,
            }));
        }
        emitRewardOffer((res as { boostOffer?: unknown }).boostOffer);
        await refreshUser();
        await fetchGlobalStats();
        await fetchUserStats();
    }, [
        fetchGlobalStats,
        fetchUserStats,
        recordSpinHistory,
        refreshUser,
        setPlannedSpins,
        setSpinsLeft,
        setTodayWins,
        t,
    ]);

    const handleSpin = useCallback(async () => {
        if (!user || spinsLeft <= 0 || isSpinning) return;
        setIsSpinning(true);
        setSpinMode('spinning');
        setWinResult(null);
        setRotationPath(null);

        if (spinAnimationSafetyTimeoutRef.current) {
            clearTimeout(spinAnimationSafetyTimeoutRef.current);
            spinAnimationSafetyTimeoutRef.current = null;
        }
        spinAnimationPromiseRef.current = null;
        spinAnimationResolveRef.current = null;

        const spinRequest = apiPost<unknown>('/fortune/spin', {}, { suppressBoostOffer: true })
            .then((res) => ({ res } as const))
            .catch((error: unknown) => ({ error } as const));

        try {
            const plannedSpin = plannedSpins[0] || null;
            let targetRotation: number | null = null;

            if (plannedSpin) {
                targetRotation = startWheelAnimation(plannedSpin.sectorIndex);
            } else {
                const spinResponse = await spinRequest;
                if ('error' in spinResponse) throw spinResponse.error;
                const res = spinResponse.res;
                if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
                const winningIndex = Number((res as { sectorIndex?: unknown }).sectorIndex);
                targetRotation = startWheelAnimation(winningIndex);
                await finishSpinAfterAnimation(Promise.resolve(spinResponse), targetRotation);
                return;
            }

            await finishSpinAfterAnimation(spinRequest, targetRotation);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('fortune.spin_error'));
            setIsSpinning(false);
            setSpinMode('idle');
            setRotationPath(null);
            spinAnimationPromiseRef.current = null;
            spinAnimationResolveRef.current = null;
            if (spinAnimationSafetyTimeoutRef.current) {
                clearTimeout(spinAnimationSafetyTimeoutRef.current);
                spinAnimationSafetyTimeoutRef.current = null;
            }
            await fetchUserStats();
        }
    }, [
        fetchUserStats,
        finishSpinAfterAnimation,
        isSpinning,
        plannedSpins,
        spinsLeft,
        startWheelAnimation,
        t,
        toast,
        user,
    ]);

    return {
        handleRotationUpdate,
        handleSpin,
        handleSpinComplete,
        isSpinning,
        rotation,
        rotationPath,
        setWinResult,
        spinMode,
        winResult,
    };
}
