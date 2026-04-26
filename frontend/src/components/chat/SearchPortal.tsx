import React from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/context/I18nContext';

interface SearchPortalProps {
    onCancel: () => void;
}

export const SearchPortal: React.FC<SearchPortalProps> = ({ onCancel }) => {
    const { t } = useI18n();
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm"
        >
            <div className="relative">
                {/* Portal Ring 1 */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="w-64 h-64 rounded-full border-4 border-t-purple-500 border-r-transparent border-b-blue-500 border-l-transparent opacity-80"
                />
                {/* Portal Ring 2 */}
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 w-64 h-64 rounded-full border-4 border-t-transparent border-r-pink-500 border-b-transparent border-l-cyan-500 opacity-60 scale-75"
                />

                {/* Center Glow */}
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 m-auto w-32 h-32 bg-purple-500/20 rounded-full blur-xl"
                />

                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white font-bold tracking-widest text-lg animate-pulse">
                        {t('chat.searching')}
                    </span>
                </div>
            </div>

            <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8 text-gray-300 text-center max-w-md px-4"
            >
                {t('chat.search_desc')}
            </motion.p>

            <button
                onClick={onCancel}
                className="mt-8 px-6 py-2 rounded-full border border-white/20 text-white hover:bg-white/10 transition-colors"
            >
                {t('common.cancel')}
            </button>
        </motion.div>
    );
};
