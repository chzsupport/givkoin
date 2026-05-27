'use client';

import React, { type Ref } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { EnemyLayer, type EnemyLayerHandle } from './EnemyLayer';
import { GameScene, type GameSceneProps } from './GameScene';
import { TreeLayer } from './TreeLayer';
import { BaddieLayer } from './BaddieLayer';
import type { BattleSceneLayout } from './battleLayout';
import type { BattleBaddieState, BattleSparkState, BattleWeakZone } from './battleTypes';

type BattleVideoSources = {
    background: string;
    reaction: string;
};

type BattlePerformanceTier = NonNullable<GameSceneProps['performanceTier']>;

export function BattleActiveScene({
    timeLeftLabel,
    enemyLayerRef,
    battleVideoSources,
    battleLayout,
    performanceTier,
    weakZone,
    baddies,
    onValidHit,
    onVisualHit,
    checkHit,
    onImpact,
    onShotAttempt,
    weaponAvailability,
}: {
    timeLeftLabel: string;
    enemyLayerRef: Ref<EnemyLayerHandle>;
    battleVideoSources: BattleVideoSources;
    battleLayout: BattleSceneLayout;
    performanceTier: BattlePerformanceTier;
    weakZone: BattleWeakZone | null;
    baddies: BattleBaddieState[];
    onValidHit: NonNullable<React.ComponentProps<typeof EnemyLayer>['onValidHit']>;
    onVisualHit: GameSceneProps['onVisualHit'];
    checkHit: NonNullable<GameSceneProps['checkHit']>;
    onImpact: GameSceneProps['onImpact'];
    onShotAttempt: GameSceneProps['onShotAttempt'];
    weaponAvailability: GameSceneProps['weaponAvailability'];
}) {
    return (
        <>
            <div
                className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
            >
                <div className="px-3 md:px-4 py-1.5 md:py-2 rounded-2xl bg-black/70 border border-white/10 text-white text-sm md:text-base font-bold tracking-wider backdrop-blur-md">
                    {timeLeftLabel}
                </div>
            </div>

            <EnemyLayer
                ref={enemyLayerRef}
                className="z-0"
                backgroundSrc={battleVideoSources.background}
                reactionSrc={battleVideoSources.reaction}
                silhouetteSrc="/qwer1.svg"
                layout={battleLayout}
                performanceTier={performanceTier}
                weakZone={weakZone}
                onValidHit={onValidHit}
            />

            <TreeLayer
                className="z-10 pointer-events-none"
                scale={battleLayout.tree.scale}
                position={battleLayout.tree.position}
                layout={battleLayout}
                performanceTier={performanceTier}
                rotate={false}
            />

            <BaddieLayer
                baddies={baddies}
                layout={battleLayout}
                coords="world"
            />

            <div className="absolute inset-0 z-20 pointer-events-auto">
                <GameScene
                    onVisualHit={onVisualHit}
                    checkHit={checkHit}
                    onImpact={onImpact}
                    backgroundColor="transparent"
                    showCrosshair={true}
                    onShotAttempt={onShotAttempt}
                    weaponAvailability={weaponAvailability}
                    performanceTier={performanceTier}
                />
            </div>
        </>
    );
}

export function BattleSceneFallback({ showSummaryBackdrop }: { showSummaryBackdrop: boolean }) {
    if (!showSummaryBackdrop) {
        return <div className="absolute inset-0 bg-black" />;
    }

    return (
        <div className="absolute inset-0 overflow-hidden">
            <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: 'url("/8k_stars_milky_way.jpg")' }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_32%),radial-gradient(circle_at_bottom,rgba(6,182,212,0.14),transparent_36%),linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.78))]" />
        </div>
    );
}

export function BattleSparkPickup({
    visible,
    spark,
    onCollect,
}: {
    visible: boolean;
    spark: BattleSparkState | null;
    onCollect: () => void;
}) {
    if (!visible || !spark) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={onCollect}
            className="absolute z-40 pointer-events-auto"
            style={{
                left: `${Math.round(spark.x * 1000) / 10}%`,
                top: `${Math.round(spark.y * 1000) / 10}%`,
                transform: 'translate(-50%, -50%)',
            }}
        >
            <div className="rounded-full border border-amber-300/50 bg-amber-400/20 p-3 shadow-[0_0_22px_rgba(251,191,36,0.35)] backdrop-blur-sm">
                <Sparkles className="h-6 w-6 text-amber-200" />
            </div>
        </motion.div>
    );
}

export function BattleBackButton({
    visible,
    label,
    onClick,
}: {
    visible: boolean;
    label: string;
    onClick: () => void;
}) {
    if (!visible) return null;

    return (
        <motion.button
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onClick}
            className="absolute top-3 md:top-6 left-3 md:left-6 z-50 px-3 md:px-5 py-1.5 md:py-2 rounded-full border border-red-400/40 bg-gradient-to-r from-red-900/50 via-red-700/30 to-amber-500/10 text-red-100 text-caption md:text-label font-black uppercase tracking-[0.18em] md:tracking-[0.28em] shadow-[0_0_24px_rgba(248,113,113,0.35)] backdrop-blur-md transition-all hover:border-red-300/70 hover:bg-red-600/30 hover:text-red-50"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.8rem)' }}
        >
            <span className="inline-block italic skew-x-6">{label}</span>
        </motion.button>
    );
}
