import type { RegisterTranslate } from './types';

type RegisterSeedPhraseModalProps = {
  seedPhrase: string;
  seedPhraseSaved: boolean;
  t: RegisterTranslate;
  onSavedChange: (value: boolean) => void;
  onClose: () => void;
};

export function RegisterSeedPhraseModal({
  seedPhrase,
  seedPhraseSaved,
  t,
  onSavedChange,
  onClose,
}: RegisterSeedPhraseModalProps) {
  const closeIfSaved = () => {
    if (!seedPhraseSaved) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="card-glow w-full max-w-2xl bg-slate-900/90 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-h2 text-white">{t('registration.your_seed')}</h2>
          <button
            onClick={closeIfSaved}
            className={`rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white transition-colors ${
              seedPhraseSaved ? '' : 'opacity-50 cursor-not-allowed'
            }`}
            disabled={!seedPhraseSaved}
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 text-white/80 leading-relaxed">
          <div className="rounded-lg border border-white/10 bg-black/30 p-4 font-mono text-sm break-words">
            {seedPhrase}
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-white/30 bg-white/5 accent-emerald-500"
              checked={seedPhraseSaved}
              onChange={(e) => onSavedChange(e.target.checked)}
            />
            <div className="flex-1 text-body text-white/80">
              {t('registration.i_saved_seed')}
            </div>
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            onClick={closeIfSaved}
            className={`rounded-lg px-6 py-2 text-secondary font-semibold text-white ${
              seedPhraseSaved ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-white/10 opacity-50 cursor-not-allowed'
            }`}
            disabled={!seedPhraseSaved}
          >
            {t('registration.i_saved')}
          </button>
        </div>
      </div>
    </div>
  );
}
