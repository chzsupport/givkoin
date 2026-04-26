'use client';

import { PageBackground } from '@/components/PageBackground';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { apiPost } from '@/utils/api';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageTitle } from '@/components/PageTitle';
import { MessageCircle } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export default function FeedbackPage() {
  const { localePath, t } = useI18n();
  const [windowWidth, setWindowWidth] = useState(0);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<'success' | 'error' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const maxLen = 10_000;
  const messageLen = message.length;

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (!email.trim()) return false;
    if (!message.trim()) return false;
    if (messageLen > maxLen) return false;
    return true;
  }, [email, isSubmitting, message, messageLen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitResult(null);
    setSubmitError(null);

    try {
      await apiPost('/feedback', {
        name: name.trim() || undefined,
        email: email.trim(),
        message: message,
      });
      setSubmitResult('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch (err: unknown) {
      setSubmitResult('error');
      const message = err instanceof Error ? err.message : '';
      setSubmitError(message || t('feedback.send_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 text-slate-200 font-sans selection:bg-yellow-500/30">
      <PageBackground />

      <div className="relative z-10 flex items-start flex-1 min-h-0">
        <StickySideAdRail adSlot={sideAdSlot} page="feedback" placement="feedback_sidebar_left" />

        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0 overflow-y-auto">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper page="feedback" placement="feedback_header" strategy="mobile_tablet_adaptive" />
          </div>

          <header className="flex flex-col gap-2 mb-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="w-[120px] lg:w-[150px] flex-shrink-0">
                <Link
                  href={localePath('/tree')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.to_tree')}
                </Link>
              </div>

              <div />
            </div>
          </header>

          <div className="flex-1 min-h-0">
            <PageTitle
              title={t('feedback.title')}
              Icon={MessageCircle}
              gradientClassName="from-white via-slate-200 to-emerald-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-200"
              className="w-fit mx-auto mb-6"
            />
            <div className="page-content-reading rounded-2xl border border-white/10 bg-neutral-900/50 p-6 backdrop-blur-xl shadow-lg shadow-black/20">
              <div className="mt-3 text-secondary text-white/70 text-center">
                {t('feedback.subtitle')}
              </div>

              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">{t('feedback.name_optional')}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">{t('feedback.email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-tiny font-medium uppercase tracking-wider text-white/50">{t('feedback.message')}</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    maxLength={maxLen}
                    className="block min-h-[160px] w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                  <div className="flex items-center justify-end text-tiny text-white/40">
                    {messageLen}/{maxLen}
                  </div>
                </div>

                {submitResult === 'success' && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    {t('feedback.sent')}
                  </div>
                )}

                {submitResult === 'error' && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                    {submitError || t('feedback.send_error')}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-xl bg-primary-light px-5 py-2 text-secondary font-semibold text-primary-dark transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isSubmitting ? t('chat.sending') : t('common.send')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <StickySideAdRail adSlot={sideAdSlot} page="feedback" placement="feedback_sidebar_right" />
      </div>
    </div>
  );
}
