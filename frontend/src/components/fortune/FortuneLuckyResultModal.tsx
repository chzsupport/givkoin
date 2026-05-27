import { AnimatePresence, motion } from 'framer-motion';

type FortuneLuckyResultModalProps = {
    isOpen: boolean;
    prize: string | null;
    onClose: () => void;
    t: (key: string) => string;
};

export function FortuneLuckyResultModal({ isOpen, prize, onClose, t }: FortuneLuckyResultModalProps) {
    return (
        <AnimatePresence>
            {isOpen && prize && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="bg-gradient-to-br from-purple-900/90 to-pink-900/90 border border-purple-500/30 rounded-3xl p-8 text-center max-w-sm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="text-6xl mb-4">🎁</div>
                        <h2 className="text-h2 text-white mb-2">{t('fortune.congrats')}</h2>
                        <p className="text-body mb-4">{t('fortune.you_received')}</p>
                        <div className="text-h1 text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-400 mb-6">
                            {prize}
                        </div>
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-secondary"
                        >
                            {t('fortune.great')}
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
