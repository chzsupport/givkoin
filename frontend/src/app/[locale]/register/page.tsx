'use client';

import { PageBackground } from '@/components/PageBackground';
import { RegisterForm } from '@/components/register/RegisterForm';
import { RegisterRulesModal } from '@/components/register/RegisterRulesModal';
import { RegisterSeedPhraseModal } from '@/components/register/RegisterSeedPhraseModal';
import { useRegisterFlow } from '@/components/register/useRegisterFlow';

export default function RegisterPage() {
  const {
    error,
    errors,
    form,
    handleSubmit,
    isReferralLocked,
    message,
    seedPhrase,
    seedPhraseSaved,
    setSeedPhrase,
    setSeedPhraseSaved,
    setShowRules,
    showRules,
    siteLanguage,
    submitting,
    t,
    updateField,
  } = useRegisterFlow();

  return (
    <>
      <PageBackground />
      <div className="flex min-h-[calc(100vh-theme(spacing.20))] items-center justify-center px-4 py-12">
        <div className="card-glow w-full max-w-3xl backdrop-blur-xl border-white/10 bg-black/40 p-8 sm:p-10">
          <div className="text-center">
            <h1 className="text-h1 text-white">{t('auth.register')}</h1>
            <p className="mt-2 text-body text-white/60">{t('registration.trust_environment')}</p>
          </div>

          <RegisterForm
            error={error}
            errors={errors}
            form={form}
            isReferralLocked={isReferralLocked}
            message={message}
            onFieldChange={updateField}
            onRulesOpen={() => setShowRules(true)}
            onSubmit={handleSubmit}
            siteLanguage={siteLanguage}
            submitting={submitting}
            t={t}
          />

          {showRules && (
            <RegisterRulesModal t={t} onClose={() => setShowRules(false)} />
          )}

          {seedPhrase && (
            <RegisterSeedPhraseModal
              seedPhrase={seedPhrase}
              seedPhraseSaved={seedPhraseSaved}
              t={t}
              onClose={() => setSeedPhrase(null)}
              onSavedChange={setSeedPhraseSaved}
            />
          )}
        </div>
      </div>
    </>
  );
}
