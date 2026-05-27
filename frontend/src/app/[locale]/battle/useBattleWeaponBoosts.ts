import { useCallback, useMemo } from 'react';
import { WEAPON_CONFIG } from './battleConstants';
import { isBoostActiveForBattle } from './battleClientState';
import type { BattleBoostState } from './battleTypes';

type PercentBattleBoost = BattleBoostState & {
    bonusPercent?: number;
    discountPercent?: number;
};

type BattleShopBoosts = {
    battleDamage?: PercentBattleBoost;
    battleLumensDiscount?: PercentBattleBoost;
    weakZoneDamage?: PercentBattleBoost;
};

export function useBattleWeaponBoosts({
    battleId,
    displayedLumens,
    shopBoosts,
}: {
    battleId: string | null;
    displayedLumens: number;
    shopBoosts?: BattleShopBoosts;
}) {
    const damageBoostActive = useMemo(
        () => isBoostActiveForBattle(shopBoosts?.battleDamage, battleId),
        [battleId, shopBoosts?.battleDamage],
    );
    const lumensDiscountActive = useMemo(
        () => isBoostActiveForBattle(shopBoosts?.battleLumensDiscount, battleId),
        [battleId, shopBoosts?.battleLumensDiscount],
    );
    const weakZoneBoostActive = useMemo(
        () => isBoostActiveForBattle(shopBoosts?.weakZoneDamage, battleId),
        [battleId, shopBoosts?.weakZoneDamage],
    );
    const damageBoostPercent = useMemo(
        () => damageBoostActive ? Math.max(15, Number(shopBoosts?.battleDamage?.bonusPercent) || 15) : 0,
        [damageBoostActive, shopBoosts?.battleDamage?.bonusPercent],
    );
    const lumensDiscountPercent = useMemo(
        () => lumensDiscountActive ? Math.max(25, Number(shopBoosts?.battleLumensDiscount?.discountPercent) || 25) : 0,
        [lumensDiscountActive, shopBoosts?.battleLumensDiscount?.discountPercent],
    );
    const weakZoneBoostPercent = useMemo(
        () => weakZoneBoostActive ? Math.max(50, Number(shopBoosts?.weakZoneDamage?.bonusPercent) || 50) : 0,
        [weakZoneBoostActive, shopBoosts?.weakZoneDamage?.bonusPercent],
    );

    const getEffectiveWeaponCost = useCallback((weaponIdToUse: number) => {
        const config = WEAPON_CONFIG[weaponIdToUse as keyof typeof WEAPON_CONFIG];
        if (!config) return 0;
        if (lumensDiscountPercent <= 0) return config.costLumens;
        const costMultiplier = Math.max(0.05, 1 - (Math.min(95, lumensDiscountPercent) / 100));
        return Math.max(1, Math.ceil(config.costLumens * costMultiplier));
    }, [lumensDiscountPercent]);

    const weaponAvailability = useMemo(() => ({
        1: true,
        2: displayedLumens >= getEffectiveWeaponCost(2),
        3: displayedLumens >= getEffectiveWeaponCost(3),
    }), [displayedLumens, getEffectiveWeaponCost]);

    return {
        damageBoostPercent,
        getEffectiveWeaponCost,
        weakZoneBoostPercent,
        weaponAvailability,
    };
}
