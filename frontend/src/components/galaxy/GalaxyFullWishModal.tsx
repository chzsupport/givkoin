import { GalaxyWishModalShell } from './GalaxyWishModalShell';
import type { Wish } from './types';

type GalaxyFullWishModalProps = {
  isWishEditable: (wish: Wish) => boolean;
  onClose: () => void;
  onOpenWishEdit: (wish: Wish) => void;
  t: (key: string) => string;
  wish: Wish | null;
};

export function GalaxyFullWishModal({
  isWishEditable,
  onClose,
  onOpenWishEdit,
  t,
  wish,
}: GalaxyFullWishModalProps) {
  return (
    <GalaxyWishModalShell
      backdropClassName="bg-black/80 backdrop-blur-md"
      isOpen={Boolean(wish)}
      onClose={onClose}
      panelClassName="relative w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
      zIndexClassName="z-[100]"
    >
      {wish && (
        <>
          <h3 className="text-h3 font-bold text-white mb-5 uppercase tracking-widest">{t('galaxy.full_modal.title')}</h3>
          <p className="text-secondary text-neutral-200 leading-relaxed italic whitespace-pre-wrap" data-no-translate>
            &quot;{wish.text}&quot;
          </p>
          {wish.status === 'fulfilled' && (wish.executorName || wish.executorId) && (
            <p className="mt-5 text-tiny font-bold uppercase tracking-widest text-emerald-300">
              {t('galaxy.full_modal.fulfilled_by')} {wish.executorName || wish.executorId?.slice(-6)}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {isWishEditable(wish) && (
              <button
                type="button"
                onClick={() => onOpenWishEdit(wish)}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-tiny font-bold uppercase tracking-widest text-white hover:bg-white/10"
              >
                {t('common.edit')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-2xl bg-blue-600 px-5 py-3 text-tiny font-bold uppercase tracking-widest text-white"
            >
              {t('common.close')}
            </button>
          </div>
        </>
      )}
    </GalaxyWishModalShell>
  );
}
