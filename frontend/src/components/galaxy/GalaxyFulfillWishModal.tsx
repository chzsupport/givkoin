import { GalaxyWishModalShell } from './GalaxyWishModalShell';
import type { Wish } from './types';

type GalaxyFulfillWishModalProps = {
  contactInfo: string;
  onClose: () => void;
  onContactInfoChange: (value: string) => void;
  onFulfill: () => void;
  t: (key: string) => string;
  wish: Wish | null;
};

export function GalaxyFulfillWishModal({
  contactInfo,
  onClose,
  onContactInfoChange,
  onFulfill,
  t,
  wish,
}: GalaxyFulfillWishModalProps) {
  return (
    <GalaxyWishModalShell
      backdropClassName="bg-black/80 backdrop-blur-md"
      isOpen={Boolean(wish)}
      onClose={onClose}
      panelClassName="relative w-full max-w-lg bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
      zIndexClassName="z-[100]"
    >
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-3xl mb-6 mx-auto">
        🤝
      </div>
      <h3 className="text-h3 font-bold text-white mb-4 text-center uppercase tracking-widest">{t('galaxy.fulfill_modal.title')}</h3>

      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 mb-8">
        <p className="text-tiny text-neutral-400 leading-relaxed text-center uppercase tracking-widest">
          {t('galaxy.fulfill_modal.note')}
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-tiny font-bold text-neutral-500 uppercase tracking-widest ml-2">{t('galaxy.fulfill_modal.contact_label')}</label>
          <input
            type="text"
            value={contactInfo}
            onChange={(e) => onContactInfoChange(e.target.value)}
            placeholder={t('galaxy.fulfill_modal.contact_placeholder')}
            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-body text-white focus:border-blue-500/50 focus:outline-none transition-all"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-tiny font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onFulfill}
            disabled={!contactInfo}
            className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-tiny font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
          >
            {t('common.check')}
          </button>
        </div>
      </div>
    </GalaxyWishModalShell>
  );
}
