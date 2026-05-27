import { motion } from 'framer-motion';
import type { AdBoostOffer, AdBoostTranslate } from './types';

type AdBoostMiniPromptProps = {
  offer: AdBoostOffer;
  t: AdBoostTranslate;
  onClose: () => void;
  onOpen: () => void;
};

export function AdBoostMiniPrompt({ offer, t, onClose, onOpen }: AdBoostMiniPromptProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className="fixed inset-x-0 bottom-4 z-[10001] flex justify-center px-4"
    >
      <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-yellow-200/35 bg-slate-950/92 p-3 shadow-[0_0_34px_rgba(250,204,21,0.2)] backdrop-blur-md">
        <button
          type="button"
          onClick={onOpen}
          aria-label={offer.title || t('ads.boost_title')}
          className="min-w-0 flex-1 rounded-xl bg-gradient-to-r from-sky-500 via-rose-500 to-yellow-300 px-4 py-3 text-sm font-black uppercase tracking-widest text-slate-950 shadow-[0_0_24px_rgba(250,204,21,0.45)] transition hover:brightness-110 animate-pulse"
        >
          {t('ads.boost_button')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-xs font-bold uppercase tracking-widest text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          {t('common.close')}
        </button>
      </div>
    </motion.div>
  );
}
