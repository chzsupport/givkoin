'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface ShiftControlsProps {
    isServing: boolean;
    onStart: () => void;
    onEnd: () => void;
    loading: boolean;
}

export const ShiftControls: React.FC<ShiftControlsProps> = ({ isServing, onStart, onEnd, loading }) => {
    const { t } = useI18n();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onStart}
                disabled={isServing || loading}
                className={`
          relative overflow-hidden p-8 rounded-2xl border-2 transition-all duration-300
          ${isServing
                        ? 'border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed'
                        : 'border-green-500/30 bg-green-900/10 hover:bg-green-900/20 text-green-400 hover:border-green-500/60 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                    }
        `}
            >
                <div className="flex flex-col items-center gap-3">
                    <Shield className="w-12 h-12" />
                    <span className="text-2xl font-bold uppercase tracking-wider">{t('night_shift.post_taken')}</span>
                    <span className="text-sm opacity-70">{t('night_shift.start_shift')}</span>
                </div>
            </motion.button>

            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onEnd}
                disabled={!isServing || loading}
                className={`
          relative overflow-hidden p-8 rounded-2xl border-2 transition-all duration-300
          ${!isServing
                        ? 'border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed'
                        : 'border-red-500/30 bg-red-900/10 hover:bg-red-900/20 text-red-400 hover:border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                    }
        `}
            >
                <div className="flex flex-col items-center gap-3">
                    <ShieldAlert className="w-12 h-12" />
                    <span className="text-2xl font-bold uppercase tracking-wider">{t('night_shift.post_handed_over')}</span>
                    <span className="text-sm opacity-70">{t('night_shift.end_shift_get_paid')}</span>
                </div>
            </motion.button>
        </div>
    );
};
