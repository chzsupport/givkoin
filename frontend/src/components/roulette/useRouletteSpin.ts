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
    const spinFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sectorAngle = 360 / ROULETTE_SECTORS.length;

    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);

    useEffect(() => {
        return () => {
            if (spinFinishTimeoutRef.current) {
                clearTimeout(spinFinishTimeoutRef.current);
            }
        };
    }, []);

    const handleRotationUpdate = useCallback((nextRotation: number) => {
        rotationRef.current = nextRotation;
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
        setRotationPath(path);
        setRotation(startRotation);
        return targetRotation;
    }, [sectorAngle]);

    const handleSpin = useCallback(async () => {
        if (!user || spinsLeft <= 0 || isSpinning) return;
        setIsSpinning(true);
        setSpinMode('spinning');
        setWinResult(null);
        setRotationPath(null);

        if (spinFinishTimeoutRef.current) {
            clearTimeout(spinFinishTimeoutRef.current);
            spinFinishTimeoutRef.current = null;
        }

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
            }

            spinFinishTimeoutRef.current = setTimeout(async () => {
                try {
                    const spinResponse = await spinRequest;
                    if ('error' in spinResponse) throw spinResponse.error;
                    const res = spinResponse.res;
                    if (typeof res !== 'object' || res === null) throw new Error(t('fortune.invalid_server_response'));
                    const serverResult = parseSpinResult((res as { result?: unknown }).result);
                    const remainingSpins = Number((res as { spinsLeft?: unknown }).spinsLeft);
                    const normalizedRotation = normalizeRotation(targetRotation || rotationRef.current);
                    rotationRef.current = normalizedRotation;
                    setIsSpinning(false);
                    setSpinMode('idle');
                    setRotationPath(null);
                    setRotation(normalizedRotation);
                    setWinResult(serverResult);
                    if (Number.isFinite(remainingSpins)) setSpinsLeft(remainingSpins);
                    setPlannedSpins((current) => current.slice(1));
                    spinFinishTimeoutRef.current = null;

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
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : '';
                    toast.error(t('common.error'), message || t('fortune.spin_error'));
                    setIsSpinning(false);
                    setSpinMode('idle');
                    setRotationPath(null);
                    await fetchUserStats();
                }
            }, ROULETTE_SPIN_DURATION_MS);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('fortune.spin_error'));
            setIsSpinning(false);
            setSpinMode('idle');
            setRotationPath(null);
        }
    }, [
        fetchGlobalStats,
        fetchUserStats,
        isSpinning,
        plannedSpins,
        recordSpinHistory,
        refreshUser,
        setPlannedSpins,
        setSpinsLeft,
        setTodayWins,
        spinsLeft,
        startWheelAnimation,
        t,
        toast,
        user,
    ]);

    return {
        handleRotationUpdate,
        handleSpin,
        isSpinning,
        rotation,
        rotationPath,
        setWinResult,
        spinMode,
        winResult,
    };
}
