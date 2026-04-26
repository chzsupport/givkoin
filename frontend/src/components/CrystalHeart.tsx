'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CrystalHeartProps {
    collectedShards: number[];
}

export const CrystalHeart: React.FC<CrystalHeartProps> = ({ collectedShards }) => {
    const isComplete = collectedShards.length === 12;

    // Функция для отрисовки сегмента сердца
    // Сердце будет состоять из 12 треугольных/трапециевидных секторов, сходящихся к центру
    const renderSegment = (index: number) => {
        const isCollected = collectedShards.includes(index);
        const angle = (index * 360) / 12;
        const nextAngle = ((index + 1) * 360) / 12;

        // Координаты для SVG секторов (в центре 100,100)
        const radius = 90;
        const x1 = 100 + radius * Math.cos((angle * Math.PI) / 180);
        const y1 = 100 + radius * Math.sin((angle * Math.PI) / 180);
        const x2 = 100 + radius * Math.cos((nextAngle * Math.PI) / 180);
        const y2 = 100 + radius * Math.sin((nextAngle * Math.PI) / 180);

        return (
            <motion.path
                key={index}
                d={`M 100 100 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
                fill={isCollected ? (isComplete ? '#60A5FA' : '#3B82F6') : '#1F2937'}
                stroke="#0F172A"
                strokeWidth="1"
                initial={false}
                animate={{
                    fill: isCollected ? (isComplete ? '#60A5FA' : '#3B82F6') : '#1F2937',
                    opacity: isCollected ? 1 : 0.3,
                    scale: isCollected ? 1 : 0.95,
                }}
                transition={{ duration: 0.5 }}
                style={{ filter: isCollected ? 'drop-shadow(0 0 5px rgba(96, 165, 250, 0.5))' : 'none' }}
            />
        );
    };

    return (
        <div className="relative w-64 h-64 mx-auto">
            {/* Маска в форме сердца */}
            <svg viewBox="0 0 200 200" className="w-full h-full">
                <defs>
                    <clipPath id="heartClip">
                        <path d="M100 180 C100 180 20 130 20 70 C20 30 60 20 100 60 C140 20 180 30 180 70 C180 130 100 180 100 180 Z" />
                    </clipPath>
                </defs>

                <g clipPath="url(#heartClip)">
                    {/* Фоновый круг, разделенный на сектора */}
                    {[...Array(12)].map((_, i) => renderSegment(i))}
                </g>

                {/* Контур сердца */}
                <path
                    d="M100 180 C100 180 20 130 20 70 C20 30 60 20 100 60 C140 20 180 30 180 70 C180 130 100 180 100 180 Z"
                    fill="none"
                    stroke={isComplete ? "#60A5FA" : "rgba(255,255,255,0.1)"}
                    strokeWidth="2"
                />

                {/* Эффект хрустального блеска при полном сборе */}
                {isComplete && (
                    <motion.path
                        d="M70 50 L100 80 L130 50"
                        fill="none"
                        stroke="white"
                        strokeWidth="1"
                        opacity="0.5"
                        animate={{ opacity: [0.2, 0.6, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    />
                )}
            </svg>

            {isComplete && (
                <motion.div
                    className="absolute inset-0 bg-blue-400/20 blur-3xl rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                />
            )}
        </div>
    );
};
