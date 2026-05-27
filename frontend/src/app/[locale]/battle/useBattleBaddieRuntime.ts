'use client';

import { useBattleBaddieImpact } from './useBattleBaddieImpact';
import { useBattleBaddieMotion, useBattleBaddieWaves } from './useBattleBaddies';

type BattleBaddieRuntimeOptions = {
    impact: Parameters<typeof useBattleBaddieImpact>[0];
    motion: Parameters<typeof useBattleBaddieMotion>[0];
    waves: Parameters<typeof useBattleBaddieWaves>[0];
};

export function useBattleBaddieRuntime({
    impact,
    motion,
    waves,
}: BattleBaddieRuntimeOptions) {
    const handleImpact = useBattleBaddieImpact(impact);

    useBattleBaddieWaves(waves);
    useBattleBaddieMotion(motion);

    return handleImpact;
}
