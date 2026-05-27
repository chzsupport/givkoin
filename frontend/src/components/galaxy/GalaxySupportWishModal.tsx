import { formatUserK } from '@/utils/formatters';
import { GalaxyWishModalShell } from './GalaxyWishModalShell';
import type { Wish } from './types';

type GalaxySupportWishModalProps = {
  onClose: () => void;
  onSupportAmountChange: (value: string) => void;
  onSupportConfirm: () => void;
  supportAmount: string;
  t: (key: string) => string;
  userK: number;
  wish: Wish | null;
};

export function GalaxySupportWishModal({
  onClose,
  onSupportAmountChange,
  onSupportConfirm,
  supportAmount,
  t,
  userK,
  wish,
}: GalaxySupportWishModalProps) {
  return (
    <GalaxyWishModalShell
      backdropClassName="bg-black/80 backdrop-blur-md"
      isOpen={Boolean(wish)}
      onClose={onClose}
      panelClassName="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
      zIndexClassName="z-[100]"
    >
      <h3 className="text-h3 font-bold text-white mb-2 uppercase tracking-widest">{t('galaxy.support_modal.title')}</h3>
      <p className="text-tiny text-neutral-500 mb-8 uppercase tracking-widest">{t('galaxy.support_modal.subtitle')}</p>

      <div className="space-y-6">
        <div className="relative">
          <input
            type="number"
            value={supportAmount}
            onChange={(e) => onSupportAmountChange(e.target.value)}
            placeholder={t('galaxy.support_modal.placeholder')}
            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-mono text-h2 focus:border-blue-500/50 focus:outline-none transition-all"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-tiny font-bold text-neutral-500 uppercase tracking-widest">K</div>
        </div>

        <div className="flex justify-between text-tiny font-bold uppercase tracking-widest px-2">
          <span className="text-neutral-500">{t('galaxy.support_modal.your_balance')}</span>
          <span className="text-blue-400">{formatUserK(userK)} K</span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-tiny font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSupportConfirm}
            disabled={!supportAmount || parseInt(supportAmount) <= 0 || parseInt(supportAmount) > userK}
            className="flex-1 py-4 bg-blue-600 rounded-2xl text-tiny font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
          >
            {t('common.next')}
          </button>
        </div>
      </div>
    </GalaxyWishModalShell>
  );
}
