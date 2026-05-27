'use client';

import { motion } from 'framer-motion';

export const SpinButton = ({
    onClick,
    disabled,
    isSpinning,
    labelIdle,
    labelSpinning,
    scale = 1
}: {
    onClick: () => void;
    disabled: boolean;
    isSpinning: boolean;
    labelIdle: string;
    labelSpinning: string;
    scale?: number
}) => (
    <motion.button
        onClick={onClick}
        disabled={disabled}
        whileHover={{ scale: 1.05 * scale }}
        whileTap={{ scale: 0.95 * scale }}
        style={{ transform: `scale(${scale})` }}
        className={`relative px-8 py-3 rounded-xl font-black text-base tracking-wider transition-all overflow-hidden origin-center
            ${disabled
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-2 border-gray-600'
                : 'bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-400 text-black border-2 border-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.5)]'}`}
    >
        {isSpinning && (
            <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
        )}
        <span className="relative z-10 drop-shadow-md">
            {isSpinning ? labelSpinning : labelIdle}
        </span>
    </motion.button>
);
