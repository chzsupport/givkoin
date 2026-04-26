import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/context/I18nContext';

interface RatingModalProps {
    isOpen: boolean;
    onRate: (liked: boolean) => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({ isOpen, onRate }) => {
    const { t } = useI18n();
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-gray-900 border border-gray-700 p-8 rounded-2xl max-w-sm w-full text-center"
                    >
                        <h3 className="text-xl font-bold text-white mb-4">{t('chat.rating_title')}</h3>
                        <p className="text-gray-400 mb-8">{t('chat.rating_desc')}</p>

                        <div className="flex justify-center gap-4">
                            <button
                                onClick={() => onRate(false)}
                                className="px-6 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                                👎 {t('chat.rating_bad')}
                            </button>
                            <button
                                onClick={() => onRate(true)}
                                className="px-6 py-3 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                            >
                                👍 {t('chat.rating_good')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
