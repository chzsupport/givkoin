import type { ManualReferralBoostStatus, ReferralText } from './types';

type ManualReferralBoostModalProps = {
  activeMessage: string;
  loadingStep: number | null;
  manualBoost: ManualReferralBoostStatus | null;
  onClose: () => void;
  onStartStep: (step: number) => void;
  t: ReferralText;
};

export function ManualReferralBoostModal({
  activeMessage,
  loadingStep,
  manualBoost,
  onClose,
  onStartStep,
  t,
}: ManualReferralBoostModalProps) {
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-sky-300/35 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.38),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.3),transparent_34%),linear-gradient(135deg,#071226,#150812_55%,#1f1604)] p-5 shadow-[0_0_65px_rgba(250,204,21,0.24)]">
        <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-sky-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-8 h-32 w-32 rounded-full bg-rose-500/30 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-black text-white">{t('referrals.manual_boost_title')}</div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">{t('referrals.manual_boost_description')}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white/70 transition hover:bg-white/10"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((step) => {
            const watched = Boolean(manualBoost?.watchedSteps?.includes(step));
            const disabled = watched || Boolean(manualBoost?.active) || loadingStep !== null;
            return (
              <button
                key={step}
                type="button"
                disabled={disabled}
                onClick={() => onStartStep(step)}
                className={`rounded-2xl border px-4 py-4 text-sm font-black uppercase tracking-widest transition ${
                  watched || manualBoost?.active
                    ? 'border-white/10 bg-white/[0.08] text-white/35'
                    : 'border-yellow-200/55 bg-gradient-to-r from-sky-500 via-rose-500 to-yellow-300 text-slate-950 shadow-[0_0_26px_rgba(250,204,21,0.22)] hover:brightness-110'
                } ${loadingStep === step ? 'opacity-70' : ''}`}
              >
                {loadingStep === step
                  ? t('referrals.manual_boost_loading')
                  : t(`referrals.manual_boost_step_${step}`)}
              </button>
            );
          })}
        </div>

        {manualBoost?.active ? (
          <div className="relative mt-5 rounded-2xl border border-yellow-200/30 bg-yellow-200/10 p-4 text-sm font-semibold leading-relaxed text-yellow-50">
            {activeMessage}
          </div>
        ) : (
          <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/65">
            {t('referrals.manual_boost_hint')}
          </div>
        )}
      </div>
    </div>
  );
}
