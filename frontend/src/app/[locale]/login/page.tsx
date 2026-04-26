'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useActiveChat } from '@/context/ActiveChatContext';

type LoginState = {
  email: string;
  seedPhrase: string;
};

const allowedDomains = ['yahoo.com', 'gmail.com', 'mail.ru', 'yandex.ru', 'yandex.com', 'rambler.ru'];

import { PageBackground } from '@/components/PageBackground';
import { useI18n } from '@/context/I18nContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isAuthLoading } = useAuth();
  const { activeChat, isLoading } = useActiveChat();
  const { t, localePath } = useI18n();

  const validateEmail = useCallback((value: string) => {
    const [local, domain] = value.toLowerCase().split('@');
    if (!local || !domain) return t('auth.invalid_email');
    if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return t('auth.email_no_dots');
    if (!allowedDomains.includes(domain)) return t('auth.allowed_domains');
    return '';
  }, [t]);
  const [form, setForm] = useState<LoginState>({ email: '', seedPhrase: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  type AuthUser = Parameters<typeof login>[0];

  // Редирект авторизованных пользователей
  useEffect(() => {
    if (isLoading || isAuthLoading) return; // Ждём проверки сессии и активного чата

    if (isAuthenticated) {
      // Если есть активный чат - туда, иначе на главную
      if (activeChat) {
        router.replace(`/chat/${activeChat._id}`);
      } else {
        router.replace(localePath('/tree'));
      }
    }
  }, [isAuthenticated, activeChat, isLoading, isAuthLoading, router, localePath]);

  const errors = useMemo(() => {
    const list: string[] = [];
    const emailError = validateEmail(form.email);
    if (emailError) list.push(emailError);
    if (!form.seedPhrase) list.push(t('auth.enter_seed'));
    return list;
  }, [form, t, validateEmail]);

  // Показываем спиннер пока проверяется авторизация
  if (isLoading || isAuthLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/60 text-sm">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  const updateField = <K extends keyof LoginState>(key: K, value: LoginState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSubmitting(true);
    try {
      const payload: LoginState = {
        email: form.email.trim().toLowerCase(),
        seedPhrase: form.seedPhrase.trim(),
      };
      const res = await apiPost<{ user: AuthUser }>('/auth/login', payload);
      if (!res.user) {
        throw new Error(t('server.not_responding'));
      }

      login(res.user);

      setMessage(t('auth.signed_in_redirect'));
      setTimeout(() => router.push(localePath('/tree')), 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('auth.sign_in_failed'));
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
            <h1 className="text-h1 text-white">{t('auth.system_sign_in')}</h1>
            <p className="mt-2 text-body text-white/60">
              {t('auth.enter_credentials')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">
                  Email
                </label>
                <input
                  type="email"
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-body"
                  placeholder={t('auth.enter_email')}
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">
                  {t('auth.seed_phrase')}
                </label>
                <textarea
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-body"
                  placeholder={t('password_reset.enter_24_words')}
                  value={form.seedPhrase}
                  onChange={(e) => updateField('seedPhrase', e.target.value)}
                  required
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <a href={localePath('/forgot-password')} shaking-wider className="text-tiny text-emerald-400 hover:text-emerald-300 transition-colors">
                {t('auth.forgot_password')}
              </a>
            </div>

            {/* Error/Success Messages */}
            {errors.length > 0 && (
              <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
                {errors[0]}
              </div>
            )}
            {message && (
              <div className="rounded-lg bg-emerald-500/10 p-3 text-body text-emerald-200 border border-emerald-500/20">
                {message}
              </div>
            )}
            {error && !message && (
              <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="group relative flex w-full justify-center overflow-hidden rounded-lg bg-emerald-600 px-4 py-3 text-secondary font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="relative z-10">{submitting ? t('auth.sign_in_loading') : t('auth.sign_in_btn')}</span>
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
