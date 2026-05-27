import { useEffect } from 'react';

export function useBattleComboInactiveReset({
    isBattleActive,
    resetCombo,
}: {
    isBattleActive: boolean;
    resetCombo: () => void;
}) {
    useEffect(() => {
        if (!isBattleActive) resetCombo();
    }, [isBattleActive, resetCombo]);
}
