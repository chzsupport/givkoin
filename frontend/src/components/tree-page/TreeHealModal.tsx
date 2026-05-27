import { AnimatePresence, motion } from 'framer-motion';

export function TreeHealModal({
  availableLumens,
  healLumens,
  isHealing,
  isOpen,
  onClose,
  onHeal,
  onHealLumensChange,
  t,
}: {
  availableLumens: number;
  healLumens: string;
  isHealing: boolean;
  isOpen: boolean;
  onClose: () => void;
  onHeal: () => void;
  onHealLumensChange: (value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-md rounded-2xl border border-emerald-500/20 bg-neutral-950 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-white font-bold uppercase tracking-widest text-tiny">{t('tree.heal_tree')}</div>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-tiny text-white/60">
                {t('tree.give_lumens_heal')}
              </div>

              <div className="space-y-2">
                <label className="text-tiny uppercase tracking-widest text-white/40">{t('tree.amount_lm')}</label>
                <input
                  type="number"
                  min={1}
                  value={healLumens}
                  onChange={(e) => onHealLumensChange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                />
                <div className="text-caption text-white/50">
                  {t('tree.available')}: {availableLumens.toLocaleString()} Lm
                </div>
              </div>

              <button
                onClick={onHeal}
                disabled={isHealing}
                className="w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny bg-emerald-600 text-white border-emerald-400 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isHealing ? t('password_reset.sending') : t('tree.give_lumens')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
