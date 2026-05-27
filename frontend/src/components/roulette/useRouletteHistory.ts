'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RouletteHistoryItem } from './types';

export function useRouletteHistory(userId?: string) {
    const [history, setHistory] = useState<RouletteHistoryItem[]>([]);
    const [spinCounter, setSpinCounter] = useState(1);

    useEffect(() => {
        if (!userId) return;

        const savedHistory = localStorage.getItem(`roulette_history_${userId}`);
        const savedCounter = localStorage.getItem(`roulette_counter_${userId}`);
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error('Error parsing history', e);
            }
        } else {
            setHistory([]);
        }

        if (savedCounter) {
            setSpinCounter(parseInt(savedCounter, 10));
        } else {
            setSpinCounter(1);
        }
    }, [userId]);

    useEffect(() => {
        if (userId && history.length > 0) {
            localStorage.setItem(`roulette_history_${userId}`, JSON.stringify(history));
        }
    }, [history, userId]);

    useEffect(() => {
        if (userId) {
            localStorage.setItem(`roulette_counter_${userId}`, spinCounter.toString());
        }
    }, [spinCounter, userId]);

    const recordSpinHistory = useCallback((label: string) => {
        const currentId = spinCounter;
        setSpinCounter((prev) => prev + 1);
        setHistory((prev) => {
            const newItem = { label, id: currentId };
            const newHistory = [...prev, newItem];
            if (newHistory.length > 3) {
                return newHistory.slice(newHistory.length - 3);
            }
            return newHistory;
        });
    }, [spinCounter]);

    return { history, recordSpinHistory };
}
