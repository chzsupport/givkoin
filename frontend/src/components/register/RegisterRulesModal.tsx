import type { RegisterTranslate } from './types';

type RegisterRulesModalProps = {
  t: RegisterTranslate;
  onClose: () => void;
};

export function RegisterRulesModal({ t, onClose }: RegisterRulesModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="card-glow w-full max-w-2xl bg-slate-900/90 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-h2 text-white">{t('registration.givkoin_rules')}</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 text-white/80 leading-relaxed">
          <p>1. {t('registration.rules_point_1')}</p>
          <p>2. {t('registration.rules_point_2')}</p>
          <p>3. {t('registration.rules_point_3')}</p>
          <p className="text-white/50 text-tiny pt-4 border-t border-white/10">{t('registration.full_rules_hint')}</p>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-secondary font-semibold text-white hover:bg-emerald-500"
          >
            {t('registration.got_it')}
          </button>
        </div>
      </div>
    </div>
  );
}
