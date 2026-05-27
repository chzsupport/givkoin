import { GalaxyWishModalShell } from './GalaxyWishModalShell';

type GalaxySupportConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSupport: () => void;
  onSupportCancelAll: () => void;
  supportAmount: string;
  t: (key: string) => string;
};

export function GalaxySupportConfirmModal({
  isOpen,
  onClose,
  onSupport,
  onSupportCancelAll,
  supportAmount,
  t,
}: GalaxySupportConfirmModalProps) {
  return (
    <GalaxyWishModalShell
      backdropClassName="bg-black/90 backdrop-blur-md"
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
      zIndexClassName="z-[110]"
    >
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl mb-6 mx-auto">
        ⚠️
      </div>
      <h3 className="text-xl font-bold text-white mb-4 text-center uppercase tracking-widest">{t('galaxy.support_confirm.title')}</h3>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 mb-8">
        <p className="text-sm text-neutral-300 text-center mb-3">
          {t('galaxy.support_confirm.you_send')}{' '}
          <span className="text-blue-400 font-bold">{supportAmount} K</span>{' '}
          {t('galaxy.support_confirm.to_support')}
        </p>
        <p className="text-label text-neutral-500 text-center">
          {t('galaxy.support_confirm.note')}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSupportCancelAll}
          className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onSupport}
          className="flex-1 py-4 bg-blue-600 rounded-2xl text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02]"
        >
          {t('common.check')}
        </button>
      </div>
    </GalaxyWishModalShell>
  );
}
