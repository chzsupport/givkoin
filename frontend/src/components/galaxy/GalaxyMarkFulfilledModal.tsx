import { GalaxyWishModalShell } from './GalaxyWishModalShell';
import type { Wish } from './types';

type GalaxyMarkFulfilledModalProps = {
  onClose: () => void;
  onMarkFulfilled: () => void;
  t: (key: string) => string;
  wish: Wish | null;
};

export function GalaxyMarkFulfilledModal({
  onClose,
  onMarkFulfilled,
  t,
  wish,
}: GalaxyMarkFulfilledModalProps) {
  return (
    <GalaxyWishModalShell
      backdropClassName="bg-black/90 backdrop-blur-md"
      isOpen={Boolean(wish)}
      onClose={onClose}
      panelClassName="relative w-full max-w-md bg-neutral-900 border border-emerald-500/30 rounded-[2.5rem] p-8 shadow-2xl"
      zIndexClassName="z-[110]"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/30 flex items-center justify-center text-5xl mb-6 mx-auto">
        🎉
      </div>
      <h3 className="text-2xl font-bold text-white mb-4 text-center uppercase tracking-widest">{t('galaxy.mark_fulfilled.title')}</h3>

      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-5 mb-8">
        <p className="text-sm text-neutral-200 text-center mb-4 leading-relaxed">
          {t('galaxy.mark_fulfilled.body')}
        </p>
        <p className="text-label text-neutral-500 text-center">
          {t('galaxy.mark_fulfilled.reward_notice')}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onMarkFulfilled}
          className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02]"
        >
          {t('common.check')}
        </button>
      </div>
    </GalaxyWishModalShell>
  );
}
