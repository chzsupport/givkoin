import { AnimatePresence, motion } from 'framer-motion';

type EntityChangeConfirmModalProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
};

export function EntityChangeConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
  t,
}: EntityChangeConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900/95 p-6 shadow-2xl"
          >
            <div className="text-center space-y-3">
              <div className="text-xs uppercase tracking-[0.35em] text-amber-400/80">{t('entity_profile.confirm_title')}</div>
              <h3 className="text-lg font-bold text-white">{t('entity_profile.change_entity_q')}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                {t('entity_profile.change_entity_desc')}
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold uppercase tracking-widest text-white shadow-lg"
              >
                {t('common.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
