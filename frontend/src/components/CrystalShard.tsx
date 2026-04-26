'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCrystal } from '@/context/CrystalContext';
import { useI18n } from '@/context/I18nContext';

interface CrystalShardProps {
    shardId: string;
    shardIndex: number;
}

const SHARD_COLORS = [
    '#60A5FA', // Blue
    '#34D399', // Emerald
    '#F87171', // Red
    '#FBBF24', // Amber
    '#A78BFA', // Violet
    '#F472B6', // Pink
    '#2DD4BF', // Teal
    '#FB923C', // Orange
    '#818CF8', // Indigo
    '#4ADE80', // Green
    '#FB7185', // Rose
    '#22D3EE', // Cyan
];

const FLIGHT_DURATION_MS = 1450;
const FLIGHT_DURATION_SECONDS = FLIGHT_DURATION_MS / 1000;

function getCabinetTargetPoint() {
    if (typeof window === 'undefined') {
        return { x: 0, y: 0 };
    }

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-crystal-target="cabinet"]'));
    const visibleTarget = targets.find((target) => {
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });

    if (visibleTarget) {
        const rect = visibleTarget.getBoundingClientRect();
        return {
            x: rect.left + (rect.width / 2),
            y: rect.top + (rect.height / 2),
        };
    }

    return {
        x: window.innerWidth - 44,
        y: 44,
    };
}

export const CrystalShard: React.FC<CrystalShardProps> = ({ shardId, shardIndex }) => {
    const { collectShard } = useCrystal();
    const { t } = useI18n();
    const shardRef = useRef<HTMLDivElement | null>(null);
    const collectTimerRef = useRef<number | null>(null);
    const [isFlying, setIsFlying] = useState(false);
    const [flightDelta, setFlightDelta] = useState<{ x: number; y: number } | null>(null);
    const color = SHARD_COLORS[shardIndex % SHARD_COLORS.length];

    useEffect(() => {
        return () => {
            if (collectTimerRef.current !== null) {
                window.clearTimeout(collectTimerRef.current);
            }
        };
    }, []);

    const finishCollection = async () => {
        try {
            await collectShard({
                shardId,
                shardIndex,
                pageName: '',
                url: '',
            });
        } catch (error) {
            console.error('[Crystal] Failed to collect shard:', error);
            setIsFlying(false);
            setFlightDelta(null);
        }
    };

    const handleClick = () => {
        if (isFlying) return;

        const shardElement = shardRef.current;
        if (!shardElement) return;

        const shardRect = shardElement.getBoundingClientRect();
        const targetPoint = getCabinetTargetPoint();

        setFlightDelta({
            x: targetPoint.x - (shardRect.left + (shardRect.width / 2)),
            y: targetPoint.y - (shardRect.top + (shardRect.height / 2)),
        });
        setIsFlying(true);

        if (collectTimerRef.current !== null) {
            window.clearTimeout(collectTimerRef.current);
        }

        collectTimerRef.current = window.setTimeout(() => {
            collectTimerRef.current = null;
            void finishCollection();
        }, FLIGHT_DURATION_MS);
    };

    return (
        <motion.div
            ref={shardRef}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={isFlying && flightDelta ? {
                x: [0, flightDelta.x * 0.38, flightDelta.x],
                y: [0, flightDelta.y * 0.2, flightDelta.y],
                scale: [1, 0.82, 0.22],
                rotate: [0, 12, 22],
                opacity: [1, 0.9, 0],
            } : {
                x: 0,
                y: 0,
                opacity: 1,
                rotate: [0, -5, 0, 5, 0],
                scale: [1, 1.15, 1],
            }}
            transition={isFlying ? {
                x: { duration: FLIGHT_DURATION_SECONDS, times: [0, 0.58, 1], ease: 'easeInOut' },
                y: { duration: FLIGHT_DURATION_SECONDS, times: [0, 0.42, 1], ease: 'easeInOut' },
                scale: { duration: FLIGHT_DURATION_SECONDS, times: [0, 0.55, 1], ease: 'easeInOut' },
                rotate: { duration: FLIGHT_DURATION_SECONDS, times: [0, 0.5, 1], ease: 'easeInOut' },
                opacity: { duration: FLIGHT_DURATION_SECONDS, times: [0, 0.72, 1], ease: 'easeOut' },
            } : {
                opacity: { duration: 0.4 },
                rotate: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
                scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
            onClick={handleClick}
            style={{
                width: '25px',
                height: '25px',
                cursor: isFlying ? 'default' : 'pointer',
                pointerEvents: isFlying ? 'none' : 'auto',
                filter: `drop-shadow(0 0 12px ${color}) drop-shadow(0 0 24px ${color}66)`,
            }}
            whileHover={isFlying ? undefined : {
                scale: 1.3,
                filter: `drop-shadow(0 0 20px ${color}) drop-shadow(0 0 40px ${color})`,
            }}
            title={t('night_shift.collect_shard')}
        >
            {/* SVG кристалл */}
            <svg viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <defs>
                    <linearGradient id={`grad-${shardIndex}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.9" />
                        <stop offset="50%" stopColor={color} stopOpacity="1" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.7" />
                    </linearGradient>
                </defs>
                {/* Основная форма кристалла */}
                <polygon
                    points="16.5,1.5 28.5,12 24,31.5 9,31.5 4.5,12"
                    fill={`url(#grad-${shardIndex})`}
                    stroke="white"
                    strokeWidth="1"
                    strokeOpacity="0.5"
                />
                {/* Грань 1 */}
                <polygon
                    points="16.5,1.5 4.5,12 16.5,15"
                    fill="white"
                    fillOpacity="0.25"
                />
                {/* Грань 2 */}
                <polygon
                    points="16.5,1.5 28.5,12 16.5,15"
                    fill="white"
                    fillOpacity="0.1"
                />
                {/* Нижняя грань */}
                <polygon
                    points="4.5,12 9,31.5 16.5,15"
                    fill={color}
                    fillOpacity="0.6"
                />
                <polygon
                    points="28.5,12 24,31.5 16.5,15"
                    fill={color}
                    fillOpacity="0.4"
                />
                <polygon
                    points="9,31.5 24,31.5 16.5,15"
                    fill={color}
                    fillOpacity="0.3"
                />
                {/* Блик */}
                <ellipse cx="12" cy="9" rx="3" ry="2.2" fill="white" fillOpacity="0.4" />
            </svg>
        </motion.div>
    );
};
