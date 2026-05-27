import { MAX_CHARS } from './constants';
import { GalaxyWishModalShell } from './GalaxyWishModalShell';
import type { Wish } from './types';

type GalaxyEditWishModalProps = {
  editWishText: string;
  isSavingWishEdit: boolean;
  onClose: () => void;
  onEditWishTextChange: (value: string) => void;
  onSaveWishEdit: () => void;
  t: (key: string) => string;
  wish: Wish | null;
};

export function GalaxyEditWishModal({
  editWishText,
  isSavingWishEdit,
  onClose,
  onEditWishTextChange,
  onSaveWishEdit,
  t,
  wish,
}: GalaxyEditWishModalProps) {
  return (
    <GalaxyWishModalShell
      backdropClassName="bg-black/85 backdrop-blur-md"
      isOpen={Boolean(wish)}
      onClose={onClose}
      panelClassName="relative w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
      zIndexClassName="z-[110]"
    >
      {wish && (
        <>
          <h3 className="text-h3 font-bold text-white mb-3 uppercase tracking-widest">{t('galaxy.edit_modal.title')}</h3>
          <p className="mb-5 text-tiny uppercase tracking-widest text-neutral-500">{t('galaxy.edit_modal.hint')}</p>
          <textarea
            value={editWishText}
            onChange={(e) => onEditWishTextChange(e.target.value.slice(0, MAX_CHARS))}
            className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-body text-white focus:border-blue-500/50 focus:outline-none"
            data-no-translate
          />
          <div className="mt-2 text-right text-tiny text-neutral-500">{editWishText.trim().length}/{MAX_CHARS}</div>
          <div className="mt-8 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-4 text-tiny font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onSaveWishEdit}
              disabled={isSavingWishEdit || !editWishText.trim()}
              className="flex-1 py-4 bg-blue-600 rounded-2xl text-tiny font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
            >
              {isSavingWishEdit ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </>
      )}
    </GalaxyWishModalShell>
  );
}
