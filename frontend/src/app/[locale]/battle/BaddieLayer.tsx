'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ENEMY_OUTLINE, ENEMY_OUTLINE_HEIGHT, ENEMY_OUTLINE_WIDTH } from './enemyZones';

export type BaddieShape = 'blob' | 'spike' | 'crystal';

export type Baddie = {
    id: string;
    x: number;
    y: number;
    size: number;
    color: string;
    shape: BaddieShape;
    exploding?: boolean;
};

export type DomeState = {
    center: { x: number; y: number };
    radius: number;
    visualScale: number;
    blinkAt: number;
};

const shapeStyles: Record<BaddieShape, React.CSSProperties> = {
    blob: {
        borderRadius: '50% 40% 60% 45%',
    },
    spike: {
        borderRadius: '35% 65% 45% 55%',
        clipPath: 'polygon(50% 0%, 80% 12%, 100% 50%, 78% 85%, 50% 100%, 18% 86%, 0% 50%, 20% 12%)',
    },
    crystal: {
        borderRadius: '20% 20% 40% 40%',
        clipPath: 'polygon(50% 0%, 85% 18%, 100% 50%, 85% 82%, 50% 100%, 15% 82%, 0% 50%, 15% 18%)',
    },
};

export const BaddieLayer = React.memo(function BaddieLayer({
    baddies,
    dome,
    coords = 'normalized',
}: {
    baddies: Baddie[];
    dome: DomeState;
    coords?: 'normalized' | 'world';
}) {
    const domeSize = `${dome.radius * dome.visualScale * 210}vmin`;
    const domeGlow = dome.blinkAt > 0;

    const normalizeBaddie = (baddie: Baddie) => {
        if (coords === 'world') {
            const nx = (baddie.x - ENEMY_OUTLINE.minX) / ENEMY_OUTLINE_WIDTH;
            const ny = (ENEMY_OUTLINE.maxY - baddie.y) / ENEMY_OUTLINE_HEIGHT;
            return {
                x: Math.min(0.98, Math.max(0.02, nx)),
                y: Math.min(0.98, Math.max(0.02, ny)),
            };
        }
        return { x: baddie.x, y: baddie.y };
    };

    return (
        <div className="absolute inset-0 z-18 pointer-events-none">
            <div
                className="absolute"
                style={{
                    left: `${dome.center.x * 100}%`,
                    top: `${dome.center.y * 100}%`,
                    width: domeSize,
                    height: domeSize,
                    transform: 'translate(-50%, -50%)',
                }}
            >
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background:
                            'radial-gradient(circle at 20% 25%, rgba(255,255,255,0.55) 0%, rgba(160,240,255,0.25) 35%, rgba(0,120,255,0.12) 62%, rgba(0,0,0,0) 82%)',
                        border: domeGlow ? '1.5px solid rgba(255,160,160,0.85)' : '1.5px solid rgba(190,250,255,0.7)',
                        boxShadow: domeGlow
                            ? '0 0 36px rgba(255,120,120,0.65), inset 0 0 60px rgba(255,170,170,0.38)'
                            : '0 0 34px rgba(120,220,255,0.5), inset 0 0 70px rgba(255,255,255,0.25)',
                        backdropFilter: 'blur(3px)',
                        transition: 'box-shadow 250ms ease, border-color 250ms ease',
                    }}
                />
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background:
                            'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 32%, rgba(255,255,255,0) 60%)',
                        mixBlendMode: 'screen',
                        opacity: 0.75,
                        filter: 'blur(0.5px)',
                    }}
                />
                <div
                    className="absolute rounded-full"
                    style={{
                        left: '18%',
                        top: '12%',
                        width: '28%',
                        height: '22%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0) 70%)',
                        mixBlendMode: 'screen',
                        opacity: 0.9,
                        filter: 'blur(1px)',
                    }}
                />
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        border: domeGlow ? '1px dashed rgba(255,120,120,0.9)' : '1px dashed rgba(120,255,255,0.5)',
                        boxShadow: domeGlow ? '0 0 12px rgba(255,120,120,0.6)' : '0 0 10px rgba(120,255,255,0.4)',
                        animation: 'spin 18s linear infinite',
                    }}
                />
            </div>

            <AnimatePresence>
                {baddies.map((baddie) => {
                    const pos = normalizeBaddie(baddie);
                    return (
                    <motion.div
                        key={baddie.id}
                        className="absolute"
                        style={{
                            left: `${pos.x * 100}%`,
                            top: `${pos.y * 100}%`,
                            width: `${baddie.size * 100}vmin`,
                            height: `${baddie.size * 100}vmin`,
                            transform: 'translate(-50%, -50%)',
                        }}
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.1 }}
                    >
                        <motion.div
                            animate={baddie.exploding ? { scale: [1, 1.6], opacity: [1, 0] } : { scale: [0.95, 1.05, 0.95] }}
                            transition={baddie.exploding ? { duration: 0.35, ease: 'easeOut' } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-full h-full"
                            style={{
                                background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), ${baddie.color} 45%, rgba(0,0,0,0.2) 100%)`,
                                boxShadow: `0 0 18px ${baddie.color}, 0 0 35px ${baddie.color}99`,
                                ...shapeStyles[baddie.shape],
                            }}
                        />
                        {baddie.exploding && (
                            <motion.div
                                className="absolute inset-0 rounded-full"
                                initial={{ opacity: 0.6, scale: 0.6 }}
                                animate={{ opacity: 0, scale: 1.8 }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                                style={{
                                    border: `2px solid ${baddie.color}`,
                                    boxShadow: `0 0 20px ${baddie.color}`,
                                }}
                            />
                        )}
                    </motion.div>
                );
                })}
            </AnimatePresence>
        </div>
    );
});
