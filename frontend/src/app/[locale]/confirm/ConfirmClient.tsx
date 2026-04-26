'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const { t, localePath } = useI18n();
  const [message, setMessage] = useState<string>(t('confirm.checking_token'));

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage(t('confirm.token_missing'));
      return;
    }

    apiGet<{ message: string }>(`/auth/confirm?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setStatus('success');
        setMessage(res.message || t('confirm.registration_complete'));
        setTimeout(() => router.push(localePath('/login')), 3000);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '';
        setStatus('error');
        setMessage(message || t('password_reset.confirmation_failed'));
      });
  }, [router, searchParams, localePath, t]);

  return (
    <div className="flex min-h-[calc(100vh-theme(spacing.20))] items-center justify-center px-4 py-12">
      <div className="card-glow w-full max-w-xl backdrop-blur-xl border-white/10 bg-black/40 p-8 sm:p-10">
        <h1 className="text-h1 text-white">{t('confirm.email_confirmation')}</h1>
        <p className="mt-3 text-body text-white/70">{t('confirm.processing_link')}</p>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-white/90">
          {status === 'pending' && <span className="text-body text-white/70 flex items-center gap-2">⏳ {message}</span>}
          {status === 'success' && <span className="text-body text-emerald-300 flex items-center gap-2">✅ {message}</span>}
          {status === 'error' && <span className="text-body text-rose-300 flex items-center gap-2">⚠️ {message}</span>}
        </div>

        {status === 'success' && (
          <p className="mt-4 text-tiny text-white/50 text-center">{t('confirm.redirect_in_3s')}</p>
        )}
      </div>
    </div>
  );
}

