'use client';

import { useId, useMemo } from 'react';
import { Star } from 'lucide-react';
import { ROULETTE_SECTORS } from './constants';

const CENTER = 50;
const OUTER_RADIUS = 48;
const INNER_RING_RADIUS = 12;
const LABEL_RADIUS = 34;

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
}: {
    size: number;
    isSpinning: boolean;
    rotation: number;
}) => {
    const gradientId = useId().replace(/:/g, '');
    const sectorAngle = 360 / ROULETTE_SECTORS.length;
    const ticks = useMemo(
        () => Array.from({ length: ROULETTE_SECTORS.length }, (_, index) => index * sectorAngle),
        [sectorAngle],
    );

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <div className="absolute inset-[-8%] rounded-full bg-yellow-400/10 blur-3xl" />
            {isSpinning && <div className="absolute inset-[-5%] rounded-full bg-cyan-300/10 blur-2xl" />}

            <div className="absolute left-1/2 top-[-3%] z-30 -translate-x-1/2">
                <div
                    className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[28px] border-l-transparent border-r-transparent border-t-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]"
                    style={{ transform: `scale(${Math.max(0.75, size / 360)})` }}
                />
                <div className="mx-auto -mt-1 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
            </div>

            <div
                className="relative h-full w-full rounded-full border border-yellow-200/30 bg-[#090914] shadow-[0_18px_70px_rgba(0,0,0,0.55),0_0_42px_rgba(234,179,8,0.20)]"
                style={{
                    transform: `rotate(${rotation}deg)`,
                    willChange: isSpinning ? 'transform' : 'auto',
                    backfaceVisibility: 'hidden',
                }}
            >
                <svg className="block h-full w-full rounded-full" viewBox="0 0 100 100" aria-hidden="true">
                    <defs>
                        <radialGradient id={`${gradientId}-metal`} cx="50%" cy="42%" r="64%">
                            <stop offset="0%" stopColor="#fff7cc" stopOpacity="0.82" />
                            <stop offset="34%" stopColor="#d9a928" stopOpacity="0.32" />
                            <stop offset="67%" stopColor="#27170a" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#050510" stopOpacity="0.84" />
                        </radialGradient>
                        <radialGradient id={`${gradientId}-shine`} cx="36%" cy="28%" r="70%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
                            <stop offset="38%" stopColor="#ffffff" stopOpacity="0.08" />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                        </radialGradient>
                        <filter id={`${gradientId}-soft-shadow`} x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#000000" floodOpacity="0.45" />
                        </filter>
                    </defs>

                    <circle cx={CENTER} cy={CENTER} r="49" fill="#050510" />

                    {ROULETTE_SECTORS.map((sector, index) => {
                        const startAngle = index * sectorAngle;
                        const endAngle = startAngle + sectorAngle;
                        const labelAngle = startAngle + sectorAngle / 2;
                        const labelPoint = polarPoint(labelAngle, LABEL_RADIUS);
                        const label = sector.type === 'k' ? `${sector.label}K` : sector.label;

                        return (
                            <g key={`${sector.type}-${sector.label}-${index}`}>
                                <path
                                    d={describeSector(startAngle, endAngle)}
                                    fill={sector.color}
                                    opacity="0.92"
                                    stroke="rgba(255,255,255,0.28)"
                                    strokeWidth="0.35"
                                />
                                <path
                                    d={describeSector(startAngle + 0.3, endAngle - 0.3)}
                                    fill={`url(#${gradientId}-shine)`}
                                    opacity="0.72"
                                />
                                <text
                                    x={labelPoint.x}
                                    y={labelPoint.y}
                                    fill="#ffffff"
                                    fontSize="4.6"
                                    fontWeight="800"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${labelAngle} ${labelPoint.x} ${labelPoint.y})`}
                                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}
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
                                stroke="#fff7cc"
                                strokeOpacity="0.54"
                                strokeWidth="0.55"
                            />
                        );
                    })}

                    <circle cx={CENTER} cy={CENTER} r="49" fill="none" stroke={`url(#${gradientId}-metal)`} strokeWidth="3.5" />
                    <circle cx={CENTER} cy={CENTER} r="43.2" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.7" />
                    <circle cx={CENTER} cy={CENTER} r={INNER_RING_RADIUS} fill="#0a0a14" stroke="#ffd166" strokeWidth="1.3" filter={`url(#${gradientId}-soft-shadow)`} />
                    <circle cx={CENTER} cy={CENTER} r="7.2" fill={`url(#${gradientId}-metal)`} stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                </svg>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-yellow-100/40 bg-[#090914] shadow-[0_0_18px_rgba(255,209,102,0.45)]"
                style={{ width: size * 0.16, height: size * 0.16 }}>
                <Star className="fill-yellow-300 text-yellow-300" style={{ width: size * 0.055, height: size * 0.055 }} />
            </div>
        </div>
    );
};
