'use client';

import { useBattleCombo } from './useBattleCombo';
import { useBattleComboInactiveReset } from './useBattleComboInactiveReset';
import { useBattleDisplayedLumensSource } from './useBattleDisplayedLumensSource';
import { useBattleDisplayedStats } from './useBattleDisplayedStats';
import { useBattleHitDeduplication } from './useBattleHitDeduplication';
import { useBattlePendingDamage } from './useBattlePendingDamage';

export function useBattlePersonalStatsRuntime({
    combo,
    comboInactiveReset,
    displayedLumensSource,
    displayedStats,
    hitDeduplication,
    pendingDamage,
}: {
    combo: Omit<Parameters<typeof useBattleCombo>[0], 'addPendingUserDamage'>;
    comboInactiveReset: Omit<Parameters<typeof useBattleComboInactiveReset>[0], 'resetCombo'>;
    displayedLumensSource: Omit<Parameters<typeof useBattleDisplayedLumensSource>[0], 'syncDisplayedLumens'>;
    displayedStats: Parameters<typeof useBattleDisplayedStats>[0];
    hitDeduplication: Parameters<typeof useBattleHitDeduplication>[0];
    pendingDamage: Omit<Parameters<typeof useBattlePendingDamage>[0], 'syncDisplayedUserDamage'>;
}) {
    const { syncDisplayedLumens, syncDisplayedUserDamage } = useBattleDisplayedStats(displayedStats);
    const { addPendingUserDamage, clearInFlightDamageBatches } = useBattlePendingDamage({
        ...pendingDamage,
        syncDisplayedUserDamage,
    });
    const { consumeAccountedHitKey } = useBattleHitDeduplication(hitDeduplication);
    const { bumpCombo, finalizeComboForReport, resetCombo } = useBattleCombo({
        ...combo,
        addPendingUserDamage,
    });

    useBattleDisplayedLumensSource({
        ...displayedLumensSource,
        syncDisplayedLumens,
    });
    useBattleComboInactiveReset({
        ...comboInactiveReset,
        resetCombo,
    });

    return {
        addPendingUserDamage,
        bumpCombo,
        clearInFlightDamageBatches,
        consumeAccountedHitKey,
        finalizeComboForReport,
        resetCombo,
        syncDisplayedLumens,
        syncDisplayedUserDamage,
    };
}
