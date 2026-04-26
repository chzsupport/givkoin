import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/context/I18nContext';

interface ComplaintModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => void;
    chipsRemaining?: number;
    chipsMax?: number;
}

const REASONS: Array<{ id: string; labelKey: string }> = [
    { id: 'insults', labelKey: 'chat.complaint_reason_insults' },
    { id: 'spam', labelKey: 'chat.complaint_reason_spam' },
    { id: 'inappropriate', labelKey: 'chat.complaint_reason_inappropriate' },
    { id: 'fraud', labelKey: 'chat.complaint_reason_fraud' },
    { id: 'other', labelKey: 'chat.complaint_reason_other' },
];

export const ComplaintModal: React.FC<ComplaintModalProps> = ({ isOpen, onClose, onSubmit, chipsRemaining, chipsMax }) => {
    const { t } = useI18n();
    const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null);
 

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
                        className="bg-gray-900 border border-gray-700 p-6 rounded-2xl max-w-sm w-full"
                    >
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <h3 className="text-xl font-bold text-white">{t('chat.complaint_title')}</h3>
                            <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold">
                                {`${chipsRemaining ?? 0}/${chipsMax ?? 15}`}
                            </div>
                        </div>
                        <div className="space-y-2 mb-6">
                            {REASONS.map((reason) => (
                                <button
                                    key={reason.id}
                                    onClick={() => setSelectedReasonId(reason.id)}
                                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${selectedReasonId === reason.id
                                            ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                >
                                    {t(reason.labelKey)}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                disabled={!selectedReasonId}
                                onClick={() => selectedReasonId && onSubmit(selectedReasonId)}
                                className="flex-1 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('chat.send')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
