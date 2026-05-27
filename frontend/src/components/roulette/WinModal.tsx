'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { RouletteSpinResult } from './types';

export const WinModal = ({
    winResult,
    congratsLabel,
    actionLabel,
    large = false,
    onClose,
}: {
    winResult: RouletteSpinResult | null;
    congratsLabel: string;
    actionLabel: string;
    large?: boolean;
    onClose: () => void;
}) => (
    <AnimatePresence>
        {winResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                    className={`relative bg-gradient-to-br from-yellow-900/90 to-orange-900/90 border-2 border-yellow-500/50 rounded-2xl p-8 max-w-sm mx-4 text-center${large ? ' transform scale-125 2xl:scale-150' : ''}`}
                    onClick={(e) => e.stopPropagation()}>
                    <div className="text-6xl mb-4">🎉</div>
                    <div className="text-gray-300 text-sm mb-2 uppercase">{congratsLabel}</div>
                    <div className="text-4xl font-black text-yellow-400 mb-6">{winResult.label}</div>
                    <button onClick={onClose} className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg text-black font-bold">{actionLabel}</button>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);
