import { useCallback, type MutableRefObject } from 'react';
import { SHOT_PREVIEW_TTL_MS } from './battleConstants';
import type {
    BattleWorldPoint,
    ShotChargeState,
    ShotPreview,
} from './battleTypes';

export function useBattleShotPreview({
    shotPreviewRef,
}: {
    shotPreviewRef: MutableRefObject<Map<string, ShotPreview>>;
}) {
    const pruneShotPreviews = useCallback(() => {
        const now = Date.now();
        for (const [shotId, preview] of shotPreviewRef.current.entries()) {
            if (now - preview.at > SHOT_PREVIEW_TTL_MS) {
                shotPreviewRef.current.delete(shotId);
            }
        }
    }, [shotPreviewRef]);

    const updateShotPreview = useCallback((
        shotIdToUse: string,
        weaponIdToUse: number,
        chargeState: ShotChargeState,
        aimWorldPoint: BattleWorldPoint | null = null,
        countsTowardCombo = true,
    ) => {
        if (!shotIdToUse) return;
        pruneShotPreviews();
        const existing = shotPreviewRef.current.get(shotIdToUse);
        shotPreviewRef.current.set(shotIdToUse, {
            at: Date.now(),
            weaponId: weaponIdToUse,
            chargeState,
            aimWorldPoint: aimWorldPoint ?? existing?.aimWorldPoint ?? null,
            countsTowardCombo: Boolean(countsTowardCombo),
        });
    }, [pruneShotPreviews, shotPreviewRef]);

    return {
        pruneShotPreviews,
        updateShotPreview,
    };
}
