'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { apiPost } from '@/utils/api';
import {
    ROULETTE_ACCELERATION_SHARE,
    ROULETTE_COAST_SHARE,
    ROULETTE_DECELERATION_SHARE,
    ROULETTE_SECTORS,
    ROULETTE_SPIN_DURATION_MS,
    ROULETTE_TOTAL_TURNS,
} from './constants';
import { emitRewardOffer, normalizeRotation, parseSpinResult } from './rouletteUtils';
import type { RoulettePlannedSpin, RouletteSpinResult, RouletteTodayWins } from './types';

type RouletteToast = {
    error: (title: string, message?: string) => void;
};

const smoothstepIntegral = (value: number) => (value * value * value) - (0.5 * value * value * value * value);

const getRouletteMotionProgress = (rawProgress: number) => {
    const progress = Math.min(1, Math.max(0, rawProgress));
    const acceleration = ROULETTE_ACCELERATION_SHARE;
    const coast = ROULETTE_COAST_SHARE;
    const deceleration = ROULETTE_DECELERATION_SHARE;
    const totalDistance = (acceleration * 0.5) + coast + (deceleration * 0.5);

    if (progress <= acceleration) {
        const localProgress = progress / acceleration;
        return (acceleration * smoothstepIntegral(localProgress)) / totalDistance;
    }

    if (progress <= acceleration + coast) {
        const distance = (acceleration * 0.5) + (progress - acceleration);
        return distance / totalDistance;
    }

    const localProgress = (progress - acceleration - coast) / deceleration;
    const decelerationDistance = deceleration * (
        localProgress - smoothstepIntegral(localProgress)
    );
    const distance = (acceleration * 0.5) + coast + decelerationDistance;
    return distance / totalDistance;
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
    const [rotation, setRotation] = useState(0);
    const [winResult, setWinResult] = useState<RouletteSpinResult | null>(null);
    const rotationRef = useRef(0);
    const spinAnimationFrameRef = useRef<number | null>(null);
    const sectorAngle = 360 / ROULETTE_SECTORS.length;

    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);

    useEffect(() => {
        return () => {
            if (spinAnimationFrameRef.current !== null) {
                cancelAnimationFrame(spinAnimationFrameRef.current);
            }
        };
    }, []);

    const cancelWheelAnimation = useCallback(() => {
        if (spinAnimationFrameRef.current !== null) {
            cancelAnimationFrame(spinAnimationFrameRef.current);
            spinAnimationFrameRef.current = null;
        }
    }, []);

    const animateWheelTo = useCallback((targetRotation: number) => new Promise<number>((resolve) => {
        cancelWheelAnimation();

        const startRotation = rotationRef.current;
        const rotationDistance = targetRotation - startRotation;
        const startedAt = performance.now();

        const updateFrame = (now: number) => {
            const elapsed = now - startedAt;
            const progress = Math.min(1, elapsed / ROULETTE_SPIN_DURATION_MS);
            const motionProgress = getRouletteMotionProgress(progress);
            const nextRotation = progress >= 1
                ? targetRotation
                : startRotation + (rotationDistance * motionProgress);

            rotationRef.current = nextRotation;
            setRotation(nextRotation);

            if (progress < 1) {
                spinAnimationFrameRef.current = requestAnimationFrame(updateFrame);
                return;
            }

            const finalRotation = normalizeRotation(targetRotation);
            spinAnimationFrameRef.current = null;
            rotationRef.current = finalRotation;
            setRotation(finalRotation);
            resolve(finalRotation);
        };

        spinAnimationFrameRef.current = requestAnimationFrame(updateFrame);
    }), [cancelWheelAnimation]);

    const startWheelAnimation = useCallback((winningIndex: number) => {
        const safeWinningIndex = Number.isFinite(winningIndex)
            ? Math.max(0, Math.min(ROULETTE_SECTORS.length - 1, Math.floor(winningIndex)))
            : 0;
        const randomOffset = (Math.random() - 0.5) * Math.min(7, sectorAngle * 0.28);
        const targetAngle = (360 - (safeWinningIndex * sectorAngle + sectorAngle / 2) + randomOffset);
        const currentAngle = normalizeRotation(rotationRef.current);
        let angleDiff = targetAngle - currentAngle;
        if (angleDiff < 0) angleDiff += 360;
        const startRotation = rotationRef.current;
        const targetRotation = startRotation + (360 * ROULETTE_TOTAL_TURNS) + angleDiff;

        return animateWheelTo(targetRotation);
    }, [animateWheelTo, sectorAngle]);

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
        const remainingSpins = Number((res as { spinsLeft?: unknown }).spinsLeft);
        const normalizedRotation = normalizeRotation(finalRotation);
        rotationRef.current = normalizedRotation;
        setIsSpinning(false);
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
        setWinResult(null);
        cancelWheelAnimation();

        const spinRequest = apiPost<unknown>('/fortune/spin', {}, { suppressBoostOffer: true })
            .then((res) => ({ res } as const))
            .catch((error: unknown) => ({ error } as const));

        try {
            const plannedSpin = plannedSpins[0] || null;
            let animationPromise: Promise<number>;

            if (plannedSpin) {
                animationPromise = startWheelAnimation(plannedSpin.sectorIndex);
            } else {
                const spinResponse = await spinRequest;
                if ('error' in spinResponse) throw spinResponse.error;
                const res = spinResponse.res;
                if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
                const winningIndex = Number((res as { sectorIndex?: unknown }).sectorIndex);
                animationPromise = startWheelAnimation(winningIndex);
                await finishSpinAfterAnimation(Promise.resolve(spinResponse), animationPromise);
                return;
            }

            await finishSpinAfterAnimation(spinRequest, animationPromise);
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
        isSpinning,
        rotation,
        setWinResult,
        winResult,
    };
}
