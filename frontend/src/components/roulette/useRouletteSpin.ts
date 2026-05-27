'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { apiPost } from '@/utils/api';
import {
    ROULETTE_SECTORS,
    ROULETTE_SPIN_DURATION_MS,
    ROULETTE_TOTAL_TURNS,
} from './constants';
import { emitRewardOffer, getRouletteDisplayLabel, normalizeRotation, parseSpinResult } from './rouletteUtils';
import type { RoulettePlannedSpin, RouletteSpinAnimation, RouletteSpinResult, RouletteTodayWins } from './types';

type RouletteToast = {
    error: (title: string, message?: string) => void;
};

const clampSectorIndex = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(ROULETTE_SECTORS.length - 1, Math.floor(value)));
};

const isSameSectorResult = (
    sector: { type: string; value: number | string; label: string },
    result: RouletteSpinResult,
) => {
    if (sector.type !== result.type) return false;
    if (sector.type === 'spin') return true;
    if (sector.type === 'k' || sector.type === 'star') {
        return Number(sector.value) === Number(result.value);
    }
    return sector.label === result.label;
};

const getVisualSectorIndex = (result: RouletteSpinResult, fallbackIndex: number) => {
    const index = ROULETTE_SECTORS.findIndex((sector) => isSameSectorResult(sector, result));
    return index >= 0 ? index : clampSectorIndex(fallbackIndex);
};

export function useRouletteSpin({
    fetchGlobalStats,
    fetchUserStats,
    recordSpinHistory,
    refreshUser,
    plannedSpins,
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
    recordSpinHistory: (label: string) => void;
    refreshUser: () => Promise<void>;
    plannedSpins: RoulettePlannedSpin[];
    setPlannedSpins: Dispatch<SetStateAction<RoulettePlannedSpin[]>>;
    setSpinsLeft: Dispatch<SetStateAction<number>>;
    setTodayWins: Dispatch<SetStateAction<RouletteTodayWins>>;
    spinsLeft: number;
    t: (key: string) => string;
    toast: RouletteToast;
    user: unknown;
}) {
    const [isSpinning, setIsSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [spinAnimation, setSpinAnimation] = useState<RouletteSpinAnimation | null>(null);
    const [winResult, setWinResult] = useState<RouletteSpinResult | null>(null);
    const rotationRef = useRef(0);
    const spinAnimationResolveRef = useRef<((rotation: number) => void) | null>(null);
    const spinAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const spinAnimationIdRef = useRef(0);
    const sectorAngle = 360 / ROULETTE_SECTORS.length;

    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);

    useEffect(() => {
        return () => {
            if (spinAnimationTimeoutRef.current) {
                clearTimeout(spinAnimationTimeoutRef.current);
            }
        };
    }, []);

    const cancelWheelAnimation = useCallback(() => {
        if (spinAnimationTimeoutRef.current) {
            clearTimeout(spinAnimationTimeoutRef.current);
            spinAnimationTimeoutRef.current = null;
        }
        spinAnimationResolveRef.current = null;
        setSpinAnimation(null);
    }, []);

    const handleSpinComplete = useCallback((finalRotation: number) => {
        rotationRef.current = finalRotation;
        setRotation(finalRotation);
        setSpinAnimation(null);

        if (spinAnimationTimeoutRef.current) {
            clearTimeout(spinAnimationTimeoutRef.current);
            spinAnimationTimeoutRef.current = null;
        }

        const resolve = spinAnimationResolveRef.current;
        spinAnimationResolveRef.current = null;
        if (resolve) resolve(finalRotation);
    }, []);

    const startWheelAnimation = useCallback((winningIndex: number) => {
        const safeWinningIndex = clampSectorIndex(winningIndex);
        const randomOffset = (Math.random() - 0.5) * Math.min(5, sectorAngle * 0.2);
        const targetAngle = (360 - (safeWinningIndex * sectorAngle + sectorAngle / 2) + randomOffset);
        const currentAngle = normalizeRotation(rotationRef.current);
        let angleDiff = targetAngle - currentAngle;
        if (angleDiff < 0) angleDiff += 360;
        const startRotation = rotationRef.current;
        const targetRotation = startRotation + (360 * ROULETTE_TOTAL_TURNS) + angleDiff;
        const id = spinAnimationIdRef.current + 1;
        spinAnimationIdRef.current = id;

        setSpinAnimation({ id, startRotation, targetRotation });

        return new Promise<number>((resolve) => {
            spinAnimationResolveRef.current = resolve;
            spinAnimationTimeoutRef.current = setTimeout(() => {
                handleSpinComplete(targetRotation);
            }, ROULETTE_SPIN_DURATION_MS + 1200);
        });
    }, [handleSpinComplete, sectorAngle]);

    const finishSpinAfterAnimation = useCallback(async (
        spinResponsePromise: Promise<{ res: unknown } | { error: unknown }>,
        animationPromise: Promise<number>,
    ) => {
        const [spinResponse, finalRotation] = await Promise.all([
            spinResponsePromise,
            animationPromise,
        ]);
        if ('error' in spinResponse) throw spinResponse.error;
        const res = spinResponse.res;
        if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
        const serverResult = parseSpinResult((res as { result?: unknown }).result);
        const displayResult = {
            ...serverResult,
            label: getRouletteDisplayLabel(serverResult),
        };
        const remainingSpins = Number((res as { spinsLeft?: unknown }).spinsLeft);
        rotationRef.current = finalRotation;
        setIsSpinning(false);
        setRotation(finalRotation);
        setWinResult(displayResult);
        if (Number.isFinite(remainingSpins)) setSpinsLeft(remainingSpins);
        setPlannedSpins((current) => current.slice(1));

        recordSpinHistory(displayResult.label);

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
        setWinResult(null);
        cancelWheelAnimation();

        const spinRequest = apiPost<unknown>('/fortune/spin', {}, { suppressBoostOffer: true })
            .then((res) => ({ res } as const))
            .catch((error: unknown) => ({ error } as const));
        const plannedSpin = plannedSpins[0] || null;
        const plannedAnimationPromise = plannedSpin
            ? startWheelAnimation(getVisualSectorIndex(parseSpinResult(plannedSpin.result), plannedSpin.sectorIndex))
            : null;

        try {
            const spinResponse = await spinRequest;
            if ('error' in spinResponse) throw spinResponse.error;
            const res = spinResponse.res;
            if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
            const serverResult = parseSpinResult((res as { result?: unknown }).result);
            const winningIndex = getVisualSectorIndex(serverResult, Number((res as { sectorIndex?: unknown }).sectorIndex));
            const animationPromise = plannedAnimationPromise || startWheelAnimation(winningIndex);
            await finishSpinAfterAnimation(Promise.resolve(spinResponse), animationPromise);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('fortune.spin_error'));
            cancelWheelAnimation();
            setIsSpinning(false);
            const normalizedRotation = normalizeRotation(rotationRef.current);
            rotationRef.current = normalizedRotation;
            setRotation(normalizedRotation);
            await fetchUserStats();
        }
    }, [
        cancelWheelAnimation,
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
        handleSpin,
        handleSpinComplete,
        isSpinning,
        rotation,
        spinAnimation,
        setWinResult,
        winResult,
    };
}
