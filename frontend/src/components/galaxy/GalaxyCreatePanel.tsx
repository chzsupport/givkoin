import { motion } from 'framer-motion';
import { COST_PER_WISH, MAX_CHARS } from './constants';

export function GalaxyCreatePanel({
  canCreate,
  onCreate,
  onWishTextChange,
  sending,
  showSuccess,
  t,
  wishText,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onWishTextChange: (value: string) => void;
  sending: boolean;
  showSuccess: boolean;
  t: (key: string) => string;
  wishText: string;
}) {
  return (
    <motion.div
      key="create"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full"
    >
      <div className="bg-neutral-900/50 border border-white/10 backdrop-blur-2xl rounded-xl lg:rounded-2xl p-3 sm:p-4 lg:p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-60 pointer-events-none" />
        <div className="absolute -top-24 -right-10 w-64 h-64 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-10 w-72 h-72 bg-gradient-to-tr from-blue-500/10 via-cyan-400/10 to-transparent blur-3xl pointer-events-none" />

        <h2 className="text-h3 text-white mb-2 lg:mb-3 text-center uppercase tracking-widest">
          {t('galaxy.create.title')}
        </h2>

        <div className="space-y-2 lg:space-y-2.5">
          <div className="relative group">
            <textarea
              value={wishText}
              onChange={(e) => onWishTextChange(e.target.value)}
              placeholder={t('galaxy.create.placeholder')}
              className="w-full min-h-[100px] lg:min-h-[110px] bg-black/40 border border-white/10 rounded-lg lg:rounded-xl p-3 lg:p-3.5 text-body text-white placeholder-neutral-600 focus:border-purple-500/50 focus:outline-none transition-all resize-none shadow-inner shadow-black/40"
              maxLength={MAX_CHARS}
            />
            <div className="absolute bottom-2 lg:bottom-2.5 right-2.5 lg:right-3 text-tiny font-mono text-neutral-500 uppercase tracking-widest">
              {wishText.length} / {MAX_CHARS}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 lg:gap-2.5 pt-0.5">
            <div className="flex items-center gap-1.5 lg:gap-2 text-neutral-400">
              <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs lg:text-sm">
                ✨
              </div>
              <div className="flex flex-col">
                <span className="text-tiny font-bold uppercase tracking-widest">{t('galaxy.create.cost_label')}</span>
                <span className="text-secondary font-bold text-white">{COST_PER_WISH} K</span>
              </div>
            </div>

            <button
              onClick={onCreate}
              disabled={!canCreate || sending}
              className="w-full sm:w-auto px-5 lg:px-6 py-2 lg:py-2.5 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-600 rounded-lg font-bold text-white uppercase tracking-[0.2em] text-tiny shadow-xl shadow-purple-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              <span className="relative z-10">
                {sending ? t('galaxy.create.sending') : t('galaxy.create.submit')}
              </span>
              {sending && (
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
              )}
            </button>
          </div>
        </div>

        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 lg:mt-4 p-2.5 lg:p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg lg:rounded-xl text-center"
          >
            <p className="text-emerald-400 text-secondary font-bold uppercase tracking-widest">
              {t('galaxy.create.success')}
            </p>
          </motion.div>
        )}
      </div>

      <p className="mt-3 lg:mt-4 text-center text-tiny text-neutral-500 leading-relaxed max-w-4xl mx-auto uppercase tracking-wider">
        {t('galaxy.create.note')}
      </p>
    </motion.div>
  );
}
