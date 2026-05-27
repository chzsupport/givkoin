import { useCallback, type MutableRefObject } from 'react';
import { WEAPON_CONFIG } from './battleConstants';
import type { ShotChargeState, ShotPreview } from './battleTypes';
import type { BattleDisplaySyncMode } from './useBattleDisplayedStats';

type GetEffectiveWeaponCost = (weaponIdToUse: number) => number;
type PruneShotPreviews = () => void;
type SyncDisplayedLumens = (mode?: BattleDisplaySyncMode) => void;
type UpdateShotPreview = (
    shotIdToUse: string,
    weaponIdToUse: number,
    chargeState: ShotChargeState,
    aimWorldPoint?: { x: number; y: number; z: number } | null,
    countsTowardCombo?: boolean,
) => void;

export function useBattleShotCharge({
    getEffectiveWeaponCost,
    predictedLumensRef,
    pruneShotPreviews,
    shotPreviewRef,
    syncDisplayedLumens,
    updateShotPreview,
}: {
    getEffectiveWeaponCost: GetEffectiveWeaponCost;
    predictedLumensRef: MutableRefObject<number>;
    pruneShotPreviews: PruneShotPreviews;
    shotPreviewRef: MutableRefObject<Map<string, ShotPreview>>;
    syncDisplayedLumens: SyncDisplayedLumens;
    updateShotPreview: UpdateShotPreview;
}) {
    return useCallback((weaponIdToUse: number, shotIdToUse: string) => {
        pruneShotPreviews();
        const existing = shotPreviewRef.current.get(shotIdToUse);
        if (existing) {
            return existing.chargeState;
        }

        const config = WEAPON_CONFIG[weaponIdToUse as keyof typeof WEAPON_CONFIG];
        if (!config) {
            updateShotPreview(shotIdToUse, weaponIdToUse, 'unavailable');
            return 'unavailable' as const;
        }

        const currentLumens = Math.max(0, Number(predictedLumensRef.current || 0));
        const effectiveCost = getEffectiveWeaponCost(weaponIdToUse);
        let chargeState: ShotChargeState = 'unavailable';

        if (currentLumens >= effectiveCost) {
            predictedLumensRef.current = currentLumens - effectiveCost;
            chargeState = 'charged';
        } else if (weaponIdToUse === 1) {
            chargeState = 'penalty';
        }

        updateShotPreview(shotIdToUse, weaponIdToUse, chargeState);
        syncDisplayedLumens();
        return chargeState;
    }, [
        getEffectiveWeaponCost,
        predictedLumensRef,
        pruneShotPreviews,
        shotPreviewRef,
        syncDisplayedLumens,
        updateShotPreview,
    ]);
}
