'use client';

import { useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import {
    ROULETTE_PATH_EASING,
    ROULETTE_PATH_TIMES,
    ROULETTE_SECTORS,
} from './constants';
import type { RouletteSpinMode } from './types';

export const WheelComponent = ({
    size,
    isSpinning,
    rotation,
    rotationPath,
    spinDuration,
    spinMode,
    onRotationUpdate,
}: {
    size: number;
    isSpinning: boolean;
    rotation: number;
    rotationPath: number[] | null;
    spinDuration: number;
    spinMode: RouletteSpinMode;
    onRotationUpdate?: (rotation: number) => void;
}) => {
    const sectorAngle = 360 / ROULETTE_SECTORS.length;
    const wheelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const node = wheelRef.current;
        if (!node) return;

        if (spinMode !== 'spinning' || !rotationPath?.length) {
            node.style.transform = `rotate(${rotation}deg)`;
            return;
        }

        const keyframes = rotationPath.map((item, index) => ({
            transform: `rotate(${item}deg)`,
            offset: ROULETTE_PATH_TIMES[index] ?? undefined,
            easing: ROULETTE_PATH_EASING[index] || 'linear',
        }));

        const animation = node.animate(keyframes, {
            duration: spinDuration * 1000,
            iterations: 1,
            fill: 'forwards',
        });

        animation.onfinish = () => {
            node.style.transform = `rotate(${rotationPath[rotationPath.length - 1]}deg)`;
            onRotationUpdate?.(rotationPath[rotationPath.length - 1]);
        };

        return () => {
            animation.cancel();
        };
    }, [onRotationUpdate, rotation, rotationPath, spinDuration, spinMode]);

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[2%] z-20">
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[16px] border-t-yellow-400 filter drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]"
                    style={{ transform: `scale(${size / 280})` }} />
            </div>
            {isSpinning && <div className="absolute inset-0 rounded-full bg-yellow-500/20 blur-2xl animate-pulse" />}
            <div
                ref={wheelRef}
                className="w-full h-full rounded-full border-[5px] border-yellow-600/50 shadow-2xl relative overflow-hidden bg-[#1a1a2e]"
                style={{
                    boxShadow: '0 0 30px rgba(234, 179, 8, 0.3), inset 0 0 20px rgba(0,0,0,0.5)',
                    transform: `rotate(${rotation}deg)`,
                    willChange: isSpinning ? 'transform' : 'auto',
                    backfaceVisibility: 'hidden',
                }}
            >
                {ROULETTE_SECTORS.map((sector, index) => {
                    const angle = index * sectorAngle;
                    return (
                        <div key={index} className="absolute w-full h-full top-0 left-0" style={{ transform: `rotate(${angle}deg)` }}>
                            <div className="absolute w-0.5 h-1/2 bg-white/15 top-0 left-1/2 -translate-x-1/2 origin-bottom" />
                            <div className="absolute w-full h-full top-0 left-0" style={{ transform: `rotate(${sectorAngle / 2}deg)` }}>
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center" style={{ height: '40%', transformOrigin: 'bottom center' }}>
                                    <span className="block font-bold drop-shadow-md"
                                        style={{
                                            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                                            color: sector.color,
                                            fontSize: `${Math.max(10, size / 28)}px`
                                        }}>
                                        {sector.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 rounded-full border-3 border-yellow-500 z-10 flex items-center justify-center shadow-lg"
                    style={{ width: size * 0.11, height: size * 0.11 }}>
                    <Star className="text-yellow-500 fill-yellow-500" style={{ width: size * 0.04, height: size * 0.04 }} />
                </div>
            </div>
        </div>
    );
};
