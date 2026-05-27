import { useCallback } from 'react';
import type { EnemyHitEvent } from './enemyZones';
import { WEAPON_CONFIG } from './battleConstants';
import type { BattleWeakZone, ShotChargeState } from './battleTypes';

type EnsureShotChargeState = (weaponIdToUse: number, shotIdToUse: string) => ShotChargeState;

export function useBattlePredictedHitDamage({
    damageBoostPercent,
    ensureShotChargeState,
    isNightShiftServing,
    weakZone,
    weakZoneBoostPercent,
}: {
    damageBoostPercent: number;
    ensureShotChargeState: EnsureShotChargeState;
    isNightShiftServing?: boolean;
    weakZone: BattleWeakZone | null;
    weakZoneBoostPercent: number;
}) {
    return useCallback((event: EnemyHitEvent) => {
        const weaponIdToUse = Number(event.weaponId);
        const config = WEAPON_CONFIG[weaponIdToUse as keyof typeof WEAPON_CONFIG];
        if (!config || !event.shotId) {
            return 0;
        }

        const chargeState = ensureShotChargeState(weaponIdToUse, event.shotId);
        if (chargeState === 'unavailable') {
            return 0;
        }

        let inWeakZone = false;
        const activeWeakZone = weakZone as BattleWeakZone | null;
        if (
            activeWeakZone?.active &&
            activeWeakZone.center &&
            Number.isFinite(event.worldPoint?.x) &&
            Number.isFinite(event.worldPoint?.y)
        ) {
            const dx = Number(event.worldPoint.x) - activeWeakZone.center.x;
            const dy = Number(event.worldPoint.y) - activeWeakZone.center.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= activeWeakZone.radius) {
                inWeakZone = true;
            }
        }

        const penaltyMultiplier = chargeState === 'penalty' ? 0.5 : 1;
        let personalBaseDamage = config.damage;
        if (damageBoostPercent > 0) {
            personalBaseDamage *= 1 + (damageBoostPercent / 100);
        }
        if (isNightShiftServing) {
            personalBaseDamage *= 2;
        }
        personalBaseDamage *= penaltyMultiplier;

        let totalDamage = personalBaseDamage;
        if (inWeakZone) {
            totalDamage += personalBaseDamage * 0.5;
            if (weakZoneBoostPercent > 0) {
                totalDamage += personalBaseDamage * (weakZoneBoostPercent / 100);
            }
        }

        return Math.max(1, Math.round(totalDamage));
    }, [damageBoostPercent, ensureShotChargeState, isNightShiftServing, weakZone, weakZoneBoostPercent]);
}
