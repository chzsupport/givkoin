'use client';

import { useBattlePredictedHitDamage } from './useBattlePredictedHitDamage';
import { useBattleShotCharge } from './useBattleShotCharge';
import { useBattleShotPreview } from './useBattleShotPreview';
import { useBattleWeaponBoosts } from './useBattleWeaponBoosts';

type ShotChargeOptions = Omit<
    Parameters<typeof useBattleShotCharge>[0],
    'getEffectiveWeaponCost' | 'pruneShotPreviews' | 'updateShotPreview'
>;

type PredictedDamageOptions = Omit<
    Parameters<typeof useBattlePredictedHitDamage>[0],
    'damageBoostPercent' | 'ensureShotChargeState' | 'weakZoneBoostPercent'
>;

export function useBattleWeaponRuntime({
    predictedDamage,
    shotCharge,
    shotPreview,
    weaponBoosts,
}: {
    predictedDamage: PredictedDamageOptions;
    shotCharge: ShotChargeOptions;
    shotPreview: Parameters<typeof useBattleShotPreview>[0];
    weaponBoosts: Parameters<typeof useBattleWeaponBoosts>[0];
}) {
    const { pruneShotPreviews, updateShotPreview } = useBattleShotPreview(shotPreview);
    const {
        damageBoostPercent,
        getEffectiveWeaponCost,
        weakZoneBoostPercent,
        weaponAvailability,
    } = useBattleWeaponBoosts(weaponBoosts);
    const ensureShotChargeState = useBattleShotCharge({
        ...shotCharge,
        getEffectiveWeaponCost,
        pruneShotPreviews,
        updateShotPreview,
    });
    const getPredictedHitDamage = useBattlePredictedHitDamage({
        ...predictedDamage,
        damageBoostPercent,
        ensureShotChargeState,
        weakZoneBoostPercent,
    });

    return {
        ensureShotChargeState,
        getEffectiveWeaponCost,
        getPredictedHitDamage,
        updateShotPreview,
        weaponAvailability,
    };
}
