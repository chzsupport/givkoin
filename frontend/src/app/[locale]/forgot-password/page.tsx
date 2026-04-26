'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/utils/api';
import { PageBackground } from '@/components/PageBackground';
import { useI18n } from '@/context/I18nContext';

export default function ForgotPasswordPage() {
  const { t, localePath } = useI18n();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSubmitting(true);

    try {
      await apiPost('/auth/forgot-password', { email });
      setMessage(t('password_reset.reset_sent'));
    } catch (err: unknown) {
      // Even if error (e.g. 404), we might want to show generic message or specific one depending on security requirements.
      // In this case, the controller returns 404 if not found, so we can show it or mask it.
      // The user asked for "Account strictly saved for email", so knowing if it exists is probably fine/expected.
      const message = err instanceof Error ? err.message : '';
      setError(message || t('auth.send_request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageBackground />
      <div className="flex min-h-[calc(100vh-theme(spacing.20))] items-center justify-center px-4 py-12">
        <div className="card-glow w-full max-w-md backdrop-blur-xl border-white/10 bg-black/40 p-8 sm:p-10">
          <div className="text-center">
            <h1 className="text-h1 text-white">{t('password_reset.recovery')}</h1>
            <p className="mt-2 text-body text-white/60">
              {t('password_reset.enter_email_registered')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">
                Email
              </label>
              <input
                type="email"
                className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                placeholder={t('auth.enter_email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
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
              disabled={submitting}
              className="group relative flex w-full justify-center overflow-hidden rounded-lg bg-emerald-600 px-4 py-3 text-secondary font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="relative z-10">{submitting ? t('password_reset.sending') : t('password_reset.recover_btn')}</span>
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>

            <div className="text-center">
              <Link href={localePath('/login')} className="text-body text-white/60 hover:text-white transition-colors">
                {t('password_reset.back_to_login')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
