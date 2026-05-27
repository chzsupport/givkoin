import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import type { EndShiftResult } from './nightShiftTypes';

type EndShiftModalProps = {
    data: EndShiftResult | null;
    onClose: () => void;
    t: (key: string) => string;
};

export function EndShiftModal({ data, onClose, t }: EndShiftModalProps) {
    return (
        <AnimatePresence>
            {data && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="bg-[#1a1a2e] border border-purple-500/30 p-8 rounded-3xl max-w-sm w-full text-center relative overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />

                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">{t('night_shift.shift_finished')}</h2>
                        <p className="text-slate-300 mb-6 leading-relaxed">{data.message}</p>
                        {typeof data.settlementEtaSeconds === 'number' && (
                            <div className="mb-8 rounded-lg border border-purple-500/20 bg-white/5 p-4 text-sm text-slate-300">
                                {t('night_shift.settlement_eta_prefix')} {Math.max(1, Math.ceil(data.settlementEtaSeconds / 60))} {t('night_shift.minutes_short')}
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors"
                        >
                            {t('night_shift.accept')}
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
