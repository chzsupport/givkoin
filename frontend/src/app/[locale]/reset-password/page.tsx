'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiPost } from '@/utils/api';
import { PageBackground } from '@/components/PageBackground';
import { useI18n } from '@/context/I18nContext';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { t, localePath } = useI18n();
  const [seedPhrase, setSeedPhrase] = useState('');
  const [confirmSeedPhrase, setConfirmSeedPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateSeedPhrase = (value: string) => {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return words.length === 24;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!token) {
      setError(t('password_reset.seed_missing_token'));
      return;
    }

    if (seedPhrase !== confirmSeedPhrase) {
      setError(t('password_reset.seed_mismatch'));
      return;
    }

    if (!validateSeedPhrase(seedPhrase)) {
      setError(t('password_reset.seed_24_words'));
      return;
    }

    setSubmitting(true);

    try {
      await apiPost('/auth/reset-password', { token, seedPhrase, confirmSeedPhrase });
      setMessage(t('password_reset.seed_changed'));
      setTimeout(() => {
        router.push(localePath('/login'));
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('password_reset.reset_failed'));
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <div className="rounded-lg bg-rose-500/10 p-4 text-rose-200 border border-rose-500/20 mb-6">
          {t('password_reset.invalid_reset_link')}
        </div>
        <Link href={localePath('/forgot-password')} className="text-emerald-400 hover:text-emerald-300">
          {t('password_reset.request_new_link')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">
            {t('password_reset.new_seed')}
          </label>
          <textarea
            className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            placeholder={t('password_reset.enter_24_words')}
            value={seedPhrase}
            onChange={(e) => setSeedPhrase(e.target.value)}
            required
            rows={3}
          />
        </div>

        <div>
          <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">
            {t('password_reset.confirm_seed')}
          </label>
          <textarea
            className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            placeholder={t('password_reset.enter_24_again')}
            value={confirmSeedPhrase}
            onChange={(e) => setConfirmSeedPhrase(e.target.value)}
            required
            rows={3}
          />
        </div>
      </div>

      {/* Error/Success Messages */}
      {message && (
        <div className="rounded-lg bg-emerald-500/10 p-3 text-body text-emerald-200 border border-emerald-500/20">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !!message}
        className="group relative flex w-full justify-center overflow-hidden rounded-lg bg-emerald-600 px-4 py-3 text-secondary font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="relative z-10">{submitting ? t('password_reset.saving') : t('password_reset.save_new_password')}</span>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <>
      <PageBackground />
      <div className="flex min-h-[calc(100vh-theme(spacing.20))] items-center justify-center px-4 py-12">
        <div className="card-glow w-full max-w-md backdrop-blur-xl border-white/10 bg-black/40 p-8 sm:p-10">
          <div className="text-center">
            <h1 className="text-h1 text-white">{t('password_reset.seed_reset')}</h1>
            <p className="mt-2 text-body text-white/60">
              {t('password_reset.enter_new_seed')}
            </p>
          </div>

          <Suspense fallback={<div className="text-white/50 text-center mt-8">{t('common.loading')}</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </>
  );
}
