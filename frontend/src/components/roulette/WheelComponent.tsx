'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { Star } from 'lucide-react';
import {
    ROULETTE_SECTORS,
    ROULETTE_SPIN_DURATION_MS,
} from './constants';
import { getRouletteDisplayLabel } from './rouletteUtils';
import type { RouletteSpinAnimation } from './types';

const CENTER = 50;
const OUTER_RADIUS = 48;
const INNER_RING_RADIUS = 12;
const LABEL_RADIUS = 33.5;

const polarPoint = (angle: number, radius: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
        x: CENTER + Math.sin(radians) * radius,
        y: CENTER - Math.cos(radians) * radius,
    };
};

const describeSector = (startAngle: number, endAngle: number) => {
    const start = polarPoint(startAngle, OUTER_RADIUS);
    const end = polarPoint(endAngle, OUTER_RADIUS);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return [
        `M ${CENTER} ${CENTER}`,
        `L ${start.x} ${start.y}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
        'Z',
    ].join(' ');
};

export const WheelComponent = ({
    size,
    isSpinning,
    rotation,
    spinAnimation,
    onSpinComplete,
}: {
    size: number;
    isSpinning: boolean;
    rotation: number;
    spinAnimation: RouletteSpinAnimation | null;
    onSpinComplete: (rotation: number) => void;
}) => {
    const gradientId = useId().replace(/:/g, '');
    const wheelRef = useRef<HTMLDivElement | null>(null);
    const sectorAngle = 360 / ROULETTE_SECTORS.length;
    const ticks = useMemo(
        () => Array.from({ length: ROULETTE_SECTORS.length }, (_, index) => index * sectorAngle),
        [sectorAngle],
    );

    useEffect(() => {
        const node = wheelRef.current;
        if (!node || spinAnimation) return;

        node.style.transform = `rotate(${rotation}deg)`;
    }, [rotation, spinAnimation]);

    useEffect(() => {
        const node = wheelRef.current;
        if (!node || !spinAnimation) return;

        const { startRotation, targetRotation } = spinAnimation;

        node.style.transform = `rotate(${startRotation}deg)`;

        const animation = node.animate([
            {
                transform: `rotate(${startRotation}deg)`,
            },
            {
                transform: `rotate(${targetRotation}deg)`,
            },
        ], {
            duration: ROULETTE_SPIN_DURATION_MS,
            easing: 'cubic-bezier(0.18, 0, 0.08, 1)',
            iterations: 1,
            fill: 'forwards',
        });

        animation.onfinish = () => {
            node.style.transform = `rotate(${targetRotation}deg)`;
            onSpinComplete(targetRotation);
        };

        return () => {
            animation.cancel();
        };
    }, [onSpinComplete, spinAnimation]);

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <div className="absolute inset-[-7%] rounded-full bg-[#FFD166]/12 blur-3xl" />
            {isSpinning && <div className="absolute inset-[-4%] rounded-full bg-[#9AE6FF]/10 blur-2xl" />}

            <div className="absolute left-1/2 top-[-3%] z-30 -translate-x-1/2">
                <div
                    className="h-0 w-0 border-l-[11px] border-r-[11px] border-t-[28px] border-l-transparent border-r-transparent border-t-[#FFD166] drop-shadow-[0_0_12px_rgba(255,209,102,0.9)]"
                    style={{ transform: `scale(${Math.max(0.75, size / 360)})` }}
                />
                <div className="mx-auto -mt-1 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
            </div>

            <div
                ref={wheelRef}
                className="relative h-full w-full rounded-full border border-[#FFD166]/45 bg-[#05070D] shadow-[0_18px_70px_rgba(0,0,0,0.58),0_0_38px_rgba(255,209,102,0.20)]"
                style={{
                    transform: `rotate(${rotation}deg)`,
                    willChange: isSpinning ? 'transform' : 'auto',
                    backfaceVisibility: 'hidden',
                }}
            >
                <svg className="block h-full w-full rounded-full" viewBox="0 0 100 100" aria-hidden="true">
                    <defs>
                        <radialGradient id={`${gradientId}-metal`} cx="50%" cy="42%" r="64%">
                            <stop offset="0%" stopColor="#FFF3B8" stopOpacity="0.95" />
                            <stop offset="34%" stopColor="#D7A928" stopOpacity="0.52" />
                            <stop offset="68%" stopColor="#4A2D0E" stopOpacity="0.34" />
                            <stop offset="100%" stopColor="#05070D" stopOpacity="0.92" />
                        </radialGradient>
                        <radialGradient id={`${gradientId}-shine`} cx="36%" cy="28%" r="70%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
                            <stop offset="36%" stopColor="#ffffff" stopOpacity="0.08" />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                        </radialGradient>
                        <filter id={`${gradientId}-soft-shadow`} x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#000000" floodOpacity="0.45" />
                        </filter>
                    </defs>

                    <circle cx={CENTER} cy={CENTER} r="49" fill="#05070D" />
                    <circle cx={CENTER} cy={CENTER} r="47.5" fill="#111827" stroke="#FFD166" strokeOpacity="0.18" strokeWidth="0.6" />

                    {ROULETTE_SECTORS.map((sector, index) => {
                        const startAngle = index * sectorAngle;
                        const endAngle = startAngle + sectorAngle;
                        const labelAngle = startAngle + sectorAngle / 2;
                        const labelPoint = polarPoint(labelAngle, LABEL_RADIUS);
                        const label = getRouletteDisplayLabel(sector);

                        return (
                            <g key={`${sector.type}-${sector.label}-${index}`}>
                                <path
                                    d={describeSector(startAngle, endAngle)}
                                    fill={sector.color}
                                    stroke="#F8E7AA"
                                    strokeOpacity="0.34"
                                    strokeWidth="0.3"
                                />
                                <path
                                    d={describeSector(startAngle + 0.3, endAngle - 0.3)}
                                    fill={`url(#${gradientId}-shine)`}
                                    opacity="0.55"
                                />
                                <text
                                    x={labelPoint.x}
                                    y={labelPoint.y}
                                    fill="#ffffff"
                                    fontSize="4.35"
                                    fontWeight="800"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${labelAngle} ${labelPoint.x} ${labelPoint.y})`}
                                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                                >
                                    {label}
                                </text>
                            </g>
                        );
                    })}

                    {ticks.map((angle) => {
                        const outer = polarPoint(angle, 48);
                        const inner = polarPoint(angle, 41.5);
                        return (
                            <line
                                key={angle}
                                x1={inner.x}
                                y1={inner.y}
                                x2={outer.x}
                                y2={outer.y}
                                stroke="#FFD166"
                                strokeOpacity="0.58"
                                strokeWidth="0.5"
                            />
                        );
                    })}

                    <circle cx={CENTER} cy={CENTER} r="49" fill="none" stroke={`url(#${gradientId}-metal)`} strokeWidth="3.5" />
                    <circle cx={CENTER} cy={CENTER} r="43.2" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.65" />
                    <circle cx={CENTER} cy={CENTER} r="18" fill="none" stroke="rgba(255,209,102,0.34)" strokeWidth="0.7" />
                    <circle cx={CENTER} cy={CENTER} r={INNER_RING_RADIUS} fill="#080B12" stroke="#FFD166" strokeWidth="1.3" filter={`url(#${gradientId}-soft-shadow)`} />
                    <circle cx={CENTER} cy={CENTER} r="7.2" fill={`url(#${gradientId}-metal)`} stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                </svg>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#FFD166]/45 bg-[#080B12] shadow-[0_0_18px_rgba(255,209,102,0.42)]"
                style={{ width: size * 0.16, height: size * 0.16 }}>
                <Star className="fill-[#FFD166] text-[#FFD166]" style={{ width: size * 0.055, height: size * 0.055 }} />
            </div>
        </div>
    );
};
