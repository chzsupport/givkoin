'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/context/I18nContext';
import { WEAPONS, type WeaponId } from './battleWeapons';

export function WeaponButton({
    id,
    active,
    onSelect,
    cooldownEndsAt,
    disabled,
    blink,
}: {
    id: WeaponId;
    active: boolean;
    onSelect: () => void;
    cooldownEndsAt: number;
    disabled?: boolean;
    blink?: boolean;
}) {
    const { t } = useI18n();
    const config = WEAPONS[id];
    const weaponLabel =
        id === 1
            ? t('battle.weapon_vulcan')
            : id === 2
                ? t('battle.weapon_cannon')
                : id === 3
                    ? t('battle.weapon_tesla')
                    : config.name;
    const [secondsLeft, setSecondsLeft] = useState(0);

    useEffect(() => {
        if (!cooldownEndsAt) return;
        const check = () => {
            const diff = cooldownEndsAt - Date.now();
            if (diff <= 0) {
                setSecondsLeft(0);
            } else {
                setSecondsLeft(diff / 1000);
                requestAnimationFrame(check);
            }
        };
        requestAnimationFrame(check);
    }, [cooldownEndsAt]);

    const onCooldown = secondsLeft > 0;
    const blinkBackground = 'linear-gradient(135deg, rgba(255,138,31,0.9), rgba(220,38,38,0.95))';
    const baseBackground = onCooldown
        ? 'linear-gradient(160deg, rgba(60,0,0,0.9), rgba(8,0,0,0.95))'
        : active
            ? `linear-gradient(160deg, ${config.baseColor}30, rgba(0,0,0,0.95) 60%)`
            : 'linear-gradient(160deg, rgba(20,20,20,0.9), rgba(0,0,0,0.95))';

    return (
        <motion.button
            onPointerDown={(event) => {
                event.stopPropagation();
            }}
            onPointerUp={(event) => {
                event.stopPropagation();
            }}
            onClick={(event) => {
                event.stopPropagation();
                if (disabled) return;
                onSelect();
            }}
            className={`relative px-2 py-1.5 flex flex-col items-center justify-center w-20 sm:w-28 md:w-36 h-14 sm:h-16 md:h-20 border-2 transition-all overflow-hidden skew-x-[10deg] rounded-xl shadow-[0_10px_22px_rgba(0,0,0,0.45)] ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0'}`}
            style={{
                borderColor: blink ? '#fb923c' : active ? config.baseColor : '#333',
                background: blink ? blinkBackground : baseBackground,
                boxShadow: active
                    ? `0 0 18px ${config.baseColor}55, 0 0 36px ${config.baseColor}25`
                    : '0 0 10px rgba(0,0,0,0.6)',
            }}
            animate={
                blink
                    ? {
                        scale: [1, 1.04, 1],
                        boxShadow: [
                            '0 0 10px rgba(249,115,22,0.6)',
                            '0 0 26px rgba(239,68,68,0.85)',
                            '0 0 10px rgba(249,115,22,0.6)',
                        ],
                    }
                    : { scale: 1, boxShadow: 'none' }
            }
            transition={blink ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
            <div className="skew-x-[-4deg] w-full flex flex-col items-center justify-center h-full z-10 relative">
                <span className={`text-caption md:text-label font-black uppercase tracking-[0.22em] sm:tracking-[0.3em] mb-1 italic ${active ? 'text-white' : 'text-gray-600'}`}>
                    {weaponLabel}
                </span>
                {onCooldown ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-[16px] sm:text-[20px] md:text-[28px] font-mono font-bold text-red-400 leading-none tabular-nums drop-shadow-[0_0_10px_rgba(255,0,0,0.65)]">
                            {secondsLeft.toFixed(1)}
                        </span>
                    </div>
                ) : (
                    <span
                        className={`text-[16px] sm:text-h3 md:text-h2 font-bold font-mono tracking-wide italic ${active ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'text-gray-700'
                            }`}
                    >
                        {active ? t('battle.weapon_ready') : '---'}
                    </span>
                )}
            </div>
            {onCooldown && (
                <motion.div
                    className="absolute inset-0 bg-red-600 opacity-20 pointer-events-none origin-left"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: secondsLeft, ease: 'linear' }}
                />
            )}
            {blink && (
                <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: [0.15, 0.5, 0.15] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <div className="absolute inset-0 bg-red-600/25" />
                    <div className="absolute inset-0 border border-red-500/80 shadow-[0_0_18px_rgba(239,68,68,0.45)]" />
                </motion.div>
            )}
        </motion.button>
    );
}
