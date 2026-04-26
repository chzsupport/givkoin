'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface RadarProps {
    sectorName: string | null;
    status: 'active' | 'off_duty';
}

export const Radar: React.FC<RadarProps> = ({ sectorName, status }) => {
    const { t } = useI18n();

    return (
        <div className="bg-black/40 border border-white/10 rounded-xl p-6 relative overflow-hidden flex flex-col items-center justify-center min-h-[200px]">
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle, #4ade80 1px, transparent 1px)', backgroundSize: '20px 20px' }}
            />

            {/* Radar Scan Animation */}
            {status === 'active' && (
                <motion.div
                    className="absolute inset-0 border-b-2 border-green-500/30 bg-gradient-to-t from-green-500/10 to-transparent"
                    animate={{ top: ['0%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
            )}

            {/* Content */}
            <div className="relative z-10 text-center">
                <div className="w-16 h-16 rounded-full border-2 border-green-500/30 flex items-center justify-center mx-auto mb-4 bg-black/50">
                    <Target className={`w-8 h-8 ${status === 'active' ? 'text-green-500' : 'text-gray-500'}`} />
                </div>

                {status === 'off_duty' ? (
                    <p className="text-gray-400 font-mono">{t('night_shift.radar_system_off')}</p>
                ) : (
                    <>
                        <p className="text-green-400 text-xs font-mono mb-1 animate-pulse">{t('night_shift.radar_scanning')}</p>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {sectorName
                                ? `${t('night_shift.radar_alert_prefix')}: ${sectorName}`
                                : t('night_shift.radar_silence')}
                        </h3>
                        {sectorName && (
                            <p className="text-sm text-gray-400">
                                {t('night_shift.radar_action')}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
