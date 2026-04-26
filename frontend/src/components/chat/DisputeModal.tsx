import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/context/I18nContext';

interface DisputeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (text: string) => void;
}

const MAX_LENGTH = 1000;

export const DisputeModal: React.FC<DisputeModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const { t } = useI18n();
    const [disputeText, setDisputeText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!disputeText.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(disputeText.trim());
            setDisputeText('');
            onClose();
        } catch (error) {
            console.error('Error submitting dispute:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (isSubmitting) return;
        setDisputeText('');
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-gray-900 border border-gray-700 p-6 rounded-2xl max-w-lg w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-white mb-2">{t('chat.dispute_title')}</h3>
                        <p className="text-sm text-gray-400 mb-4">{t('chat.dispute_desc')}</p>

                        <textarea
                            value={disputeText}
                            onChange={(e) => setDisputeText(e.target.value.slice(0, MAX_LENGTH))}
                            placeholder={t('chat.dispute_placeholder')}
                            className="w-full h-32 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-gray-700 resize-none"
                            disabled={isSubmitting}
                        />

                        <div className="flex justify-between items-center mt-2 mb-4">
                            <span className="text-xs text-gray-500">
                                {disputeText.length} / {MAX_LENGTH}
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                disabled={!disputeText.trim() || isSubmitting}
                                onClick={handleSubmit}
                                className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? t('chat.sending') : t('chat.send')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
