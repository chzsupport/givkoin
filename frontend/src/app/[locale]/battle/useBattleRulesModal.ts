'use client';

import { useCallback, useEffect, useState } from 'react';

const BATTLE_RULES_STORAGE_PREFIX = 'givkoin_battle_rules_shown';

function getBattleRulesStorageKey(userId?: string | null) {
    return `${BATTLE_RULES_STORAGE_PREFIX}_${userId || 'guest'}`;
}

export function useBattleRulesModal(isBattleActive: boolean, userId?: string | null) {
    const [rulesModalVisible, setRulesModalVisible] = useState(false);

    useEffect(() => {
        if (!isBattleActive) return;
        try {
            const shown = window.localStorage.getItem(getBattleRulesStorageKey(userId));
            if (shown) return;
            setRulesModalVisible(true);
        } catch {
        }
    }, [isBattleActive, userId]);

    const closeRulesModal = useCallback(() => {
        try {
            window.localStorage.setItem(getBattleRulesStorageKey(userId), '1');
        } catch {
        }
        setRulesModalVisible(false);
    }, [userId]);

    return {
        rulesModalVisible,
        closeRulesModal,
    };
}
