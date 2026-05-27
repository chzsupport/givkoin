import { useCallback, type MutableRefObject } from 'react';
import type { BattleSummary } from '@/lib/battleSummary';
import type { StoredBattleProgress } from './battleTypes';

type BattleEconomyUser = {
    k: number;
    lumens: number;
};

export function useBattleUserEconomySync<User extends BattleEconomyUser>({
    battleStartResourcesRef,
    predictedLumensRef,
    readBattleProgress,
    updateUser,
    user,
}: {
    battleStartResourcesRef: MutableRefObject<{ lumens: number | null; k: number | null; stars: number | null }>;
    predictedLumensRef: MutableRefObject<number>;
    readBattleProgress: (battleIdOverride?: string | null) => StoredBattleProgress | null;
    updateUser: (userData: User) => void;
    user: User | null;
}) {
    const syncUserBattleEconomy = useCallback((summary: BattleSummary | null, battleIdOverride?: string | null) => {
        if (!summary || !user) return;

        const snapshot = readBattleProgress(battleIdOverride || summary.battleId);
        const nextLumens = snapshot
            ? Math.max(0, Math.round(Number(snapshot.predictedLumens) || 0))
            : Math.max(0, Math.round(Number(predictedLumensRef.current) || Number(user.lumens) || 0));
        const baseK = snapshot?.startK ?? battleStartResourcesRef.current.k ?? Math.max(0, Math.floor(Number(user.k) || 0));
        const nextK = Math.max(
            Math.max(0, Math.floor(Number(user.k) || 0)),
            Math.max(0, Math.floor(Number(baseK) || 0)) + Math.max(0, Math.floor(Number(summary.rewardK) || 0)),
        );

        if (
            nextLumens === Math.max(0, Math.round(Number(user.lumens) || 0))
            && nextK === Math.max(0, Math.floor(Number(user.k) || 0))
        ) {
            return;
        }

        updateUser({
            ...user,
            lumens: nextLumens,
            k: nextK,
        });
    }, [battleStartResourcesRef, predictedLumensRef, readBattleProgress, updateUser, user]);

    const applySparkLumensToUser = useCallback((gained: number) => {
        if (!user) return;
        updateUser({
            ...user,
            lumens: Math.max(0, Number(user.lumens) || 0) + gained,
        });
    }, [updateUser, user]);

    return {
        applySparkLumensToUser,
        syncUserBattleEconomy,
    };
}
