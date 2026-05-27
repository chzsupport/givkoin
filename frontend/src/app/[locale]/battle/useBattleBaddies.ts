import {
    useEffect,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { getBattleAttachedWorldPoint, type BattleSceneLayout } from './battleLayout';
import { BADDIE_DAMAGE_INTERVAL } from './battleConstants';
import { getBattleElapsedMs } from './battleClientState';
import type { BattlePerformanceTier } from './useBattleEnvironment';
import type {
    BattleBaddieState,
    BattleMinuteReportAccumulator,
    BattleScenario,
} from './battleTypes';

type SetBaddies = Dispatch<SetStateAction<BattleBaddieState[]>>;

export function useBattleBaddieWaves({
    battleJoinedAtMs,
    battleJoinedRef,
    battleScenario,
    battleStartsAtMs,
    baddieIdRef,
    isBattleActive,
    processedBaddieWaveIdsRef,
    reportAccRef,
    serverOffsetMsRef,
    setBaddies,
}: {
    battleJoinedAtMs: number | null;
    battleJoinedRef: MutableRefObject<boolean>;
    battleScenario: BattleScenario | null;
    battleStartsAtMs: number | null;
    baddieIdRef: MutableRefObject<number>;
    isBattleActive: boolean;
    processedBaddieWaveIdsRef: MutableRefObject<Set<string>>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    serverOffsetMsRef: MutableRefObject<number>;
    setBaddies: SetBaddies;
}) {
    useEffect(() => {
        if (!isBattleActive || !battleScenario || battleStartsAtMs == null || battleJoinedAtMs == null || !battleJoinedRef.current) return;

        const syncBaddieWaves = () => {
            const elapsedMs = getBattleElapsedMs(battleStartsAtMs, serverOffsetMsRef.current);
            const dueWaves = battleScenario.baddieWaves.filter(
                (wave) => elapsedMs >= wave.startOffsetMs && !processedBaddieWaveIdsRef.current.has(wave.id),
            );
            if (!dueWaves.length) return;

            const newBaddies = dueWaves.flatMap((wave) => {
                processedBaddieWaveIdsRef.current.add(wave.id);
                return wave.spheres
                    .filter((sphere) => !reportAccRef.current.baddieDestroyedIds.includes(sphere.id))
                    .map((sphere) => ({
                        id: sphere.id || `baddie_${Date.now()}_${baddieIdRef.current++}`,
                        x: sphere.x,
                        y: sphere.y,
                        size: sphere.size,
                        color: sphere.color,
                        shape: sphere.shape,
                        speed: sphere.speed,
                        attached: false,
                        attachedAngle: null,
                        lastDamageAt: 0,
                    }));
            });

            if (newBaddies.length) {
                setBaddies((prev) => [...prev, ...newBaddies]);
            }
        };

        syncBaddieWaves();
        const interval = window.setInterval(syncBaddieWaves, 250);
        return () => window.clearInterval(interval);
    }, [
        battleJoinedAtMs,
        battleJoinedRef,
        battleScenario,
        battleStartsAtMs,
        baddieIdRef,
        isBattleActive,
        processedBaddieWaveIdsRef,
        reportAccRef,
        serverOffsetMsRef,
        setBaddies,
    ]);
}

export function useBattleBaddieMotion({
    battleLayout,
    battleScenario,
    isBattleActive,
    performanceTier,
    persistBattleProgress,
    reportAccRef,
    setBaddies,
    triggerDomeBlink,
}: {
    battleLayout: BattleSceneLayout;
    battleScenario: BattleScenario | null;
    isBattleActive: boolean;
    performanceTier: BattlePerformanceTier;
    persistBattleProgress: () => void;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    setBaddies: SetBaddies;
    triggerDomeBlink: () => void;
}) {
    useEffect(() => {
        if (!isBattleActive) return;
        const tickMs = performanceTier === 'low' ? 150 : performanceTier === 'medium' ? 110 : 70;
        let lastTime = performance.now();
        const baddieDamageIntervalMs = Math.max(1, battleScenario?.baddieDamageIntervalMs || BADDIE_DAMAGE_INTERVAL);
        const baddieDamagePerTick = Math.max(0, battleScenario?.baddieDamagePerTick || 1);

        const tick = () => {
            const now = performance.now();
            const delta = now - lastTime;
            lastTime = now;
            const centerWorld = battleLayout.dome.worldCenter;
            const domeRadiusWorld = battleLayout.dome.worldRadius;

            setBaddies((prev) => {
                if (!prev.length) return prev;
                let damageTicks = 0;
                const next = prev.map((baddie) => {
                    if (baddie.exploding) return baddie;
                    if (baddie.attached) {
                        const attachAngle = Number.isFinite(baddie.attachedAngle)
                            ? (baddie.attachedAngle || 0)
                            : Math.atan2(baddie.y - centerWorld.y, baddie.x - centerWorld.x);
                        if (now - baddie.lastDamageAt >= baddieDamageIntervalMs) {
                            damageTicks += baddieDamagePerTick;
                            return {
                                ...baddie,
                                attachedAngle: attachAngle,
                                lastDamageAt: now,
                            };
                        }
                        if (baddie.attachedAngle === attachAngle) {
                            return baddie;
                        }
                        return {
                            ...baddie,
                            attachedAngle: attachAngle,
                        };
                    }

                    const dx = centerWorld.x - baddie.x;
                    const dy = centerWorld.y - baddie.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= domeRadiusWorld) {
                        const attachAngle = Math.atan2(baddie.y - centerWorld.y, baddie.x - centerWorld.x);
                        const attachedWorldPoint = getBattleAttachedWorldPoint(battleLayout.viewport, battleLayout.dome, attachAngle);
                        const attachX = attachedWorldPoint.x;
                        const attachY = attachedWorldPoint.y;
                        damageTicks += baddieDamagePerTick;
                        return {
                            ...baddie,
                            x: attachX,
                            y: attachY,
                            attached: true,
                            attachedAngle: attachAngle,
                            lastDamageAt: now,
                        };
                    }
                    const step = baddie.speed * delta;
                    const nx = baddie.x + (dx / (dist || 1)) * step;
                    const ny = baddie.y + (dy / (dist || 1)) * step;
                    return { ...baddie, x: nx, y: ny };
                });

                if (damageTicks > 0) {
                    reportAccRef.current.baddieDamage += damageTicks;
                    persistBattleProgress();
                    triggerDomeBlink();
                }

                return next;
            });
        };

        tick();
        const interval = window.setInterval(tick, tickMs);
        return () => window.clearInterval(interval);
    }, [
        battleLayout.dome,
        battleLayout.viewport,
        battleScenario?.baddieDamageIntervalMs,
        battleScenario?.baddieDamagePerTick,
        isBattleActive,
        performanceTier,
        persistBattleProgress,
        reportAccRef,
        setBaddies,
        triggerDomeBlink,
    ]);
}
