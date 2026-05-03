'use client';

import { useState, useEffect } from 'react';
import { PageBackground } from '@/components/PageBackground';
import { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/utils/api';
import { PageTitle } from '@/components/PageTitle';
import { Users } from 'lucide-react';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import { useI18n } from '@/context/I18nContext';

type ReferralStats = {
  code: string;
  totalInvited: number;
  activeCount: number;
  totalEarned: number;
  manualBoost?: ManualReferralBoostStatus;
  referrals: Array<{ nickname: string; date: string; status: string }>;
};

type ManualReferralBoostStatus = {
  stepsTotal: number;
  watchedSteps: number[];
  active: boolean;
  activeUntil: string | null;
  percent: number;
  completed: boolean;
};

function emitRewardOffer(offer: unknown) {
  if (typeof window === 'undefined') return;
  if (!offer || typeof offer !== 'object' || !('id' in offer)) return;
  window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}

export default function CabinetReferralsPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [manualBoost, setManualBoost] = useState<ManualReferralBoostStatus | null>(null);
  const [loadingStep, setLoadingStep] = useState<number | null>(null);

  // Use user.nickname for the link if available, otherwise fallback or wait
  const referralLink = user?.nickname
    ? `${window.location.protocol}//${window.location.host}/ref/${user.nickname}`
    : t('common.loading');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiGet<ReferralStats>('/referrals');
        setStats(data);
        setManualBoost(data.manualBoost || null);
      } catch (error) {
        console.error('Failed to fetch referral stats', error);
      }
    };

    if (user) {
      fetchStats();
    }
  }, [user]);

  const handleCopy = () => {
    if (!user?.nickname) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ offerType?: string; result?: { referralManualBoost?: ManualReferralBoostStatus } }>).detail;
      if (detail?.offerType !== 'referral_manual_step') return;
      if (detail.result?.referralManualBoost) {
        setManualBoost(detail.result.referralManualBoost);
      }
      setLoadingStep(null);
      refreshUser();
    };
    window.addEventListener('givkoin:ad-boost-completed', handler);
    return () => window.removeEventListener('givkoin:ad-boost-completed', handler);
  }, [refreshUser]);

  const startManualBoostStep = async (step: number) => {
    if (loadingStep || manualBoost?.active || manualBoost?.watchedSteps?.includes(step)) return;
    setLoadingStep(step);
    try {
      const result = await apiPost<unknown>('/referrals/manual-boost/step', { step }, { suppressBoostOffer: true });
      if (typeof result === 'object' && result !== null && 'status' in result) {
        const status = (result as { status?: ManualReferralBoostStatus }).status;
        if (status) setManualBoost(status);
      }
      emitRewardOffer(typeof result === 'object' && result !== null ? (result as { boostOffer?: unknown }).boostOffer : null);
    } catch (error) {
      console.error('Failed to start referral manual boost step', error);
    } finally {
      setLoadingStep(null);
    }
  };

  const activeUntilLabel = manualBoost?.activeUntil
    ? new Date(manualBoost.activeUntil).toLocaleString(getSiteLanguageLocale(getSiteLanguage()))
    : '';
  const activeMessage = t('referrals.manual_boost_active_message')
    .replace('{percent}', String(manualBoost?.percent || 5))
    .replace('{until}', activeUntilLabel);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <PageBackground />

      <div className="custom-scrollbar relative z-10 h-full overflow-y-auto px-6 py-4 lg:no-scrollbar">
        <div className="space-y-6 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <PageTitle
                title={t('referrals.title')}
                Icon={Users}
                gradientClassName="from-white via-slate-200 to-emerald-200"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-200"
                size="h3"
              />
            </div>

            <button
              type="button"
              onClick={() => setBoostModalOpen(true)}
              className="referral-bonus-button group relative flex h-12 min-w-[104px] items-center justify-center overflow-hidden rounded-2xl border border-sky-300/32 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.42),transparent_34%),radial-gradient(circle_at_85%_100%,rgba(239,68,68,0.28),transparent_34%),linear-gradient(135deg,#071226,#150812_55%,#1f1604)] px-5 text-center text-sm font-black uppercase tracking-[0.22em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_12px_28px_rgba(0,0,0,0.26)] backdrop-blur-md transition hover:border-yellow-200/40"
            >
              <span className="relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.22)]">{t('referrals.manual_boost_button')}</span>
            </button>

            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-900/20 to-black/40 p-2 pl-4 backdrop-blur-md">
              <span className="text-tiny font-bold text-white/50 uppercase tracking-wider whitespace-nowrap">{t('referrals.your_link')}</span>
              <div className="max-w-[200px] sm:max-w-xs md:max-w-[250px] lg:max-w-md rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-tiny text-white/80 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                {referralLink}
              </div>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20 transition-all"
                disabled={!user?.nickname}
                title={copied ? t('referrals.copied') : t('referrals.copy')}
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
            {/* Статистика */}
            <div className="grid grid-cols-3 border-b border-white/10">
              <div className="p-4 text-center border-r border-white/10">
                <div className="text-h3 text-white mb-0.5">{stats?.totalInvited ?? 0}</div>
                <div className="text-tiny text-white/40 uppercase tracking-wider">{t('referrals.invited')}</div>
              </div>
              <div className="p-4 text-center border-r border-white/10">
                <div className="text-h3 text-emerald-400 mb-0.5">{stats?.activeCount ?? 0}</div>
                <div className="text-tiny text-white/40 uppercase tracking-wider">{t('referrals.active')}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-h3 text-amber-400 mb-0.5">{stats?.totalEarned ?? 0}</div>
                <div className="text-tiny text-white/40 uppercase tracking-wider">{t('referrals.earned_k')}</div>
              </div>
            </div>

            {/* Заголовок регистраций */}
            <div className="bg-white/5 px-6 py-2 border-b border-white/10">
              <h3 className="text-tiny font-bold text-white/60 uppercase tracking-widest">{t('referrals.last_registrations')}</h3>
            </div>

            {/* Таблица регистраций */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-secondary">
                <thead>
                  <tr className="text-tiny uppercase tracking-wider text-white/30 border-b border-white/5">
                    <th className="px-6 py-3 font-medium">{t('referrals.nickname')}</th>
                    <th className="px-6 py-3 font-medium">{t('referrals.status')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('referrals.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {stats?.referrals && stats.referrals.length > 0 ? (
                    stats.referrals.map((ref, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-tiny font-bold text-emerald-400">
                              {ref.nickname?.[0]?.toUpperCase()}
                            </div>
                            <span className="text-white/80 font-medium">{ref.nickname}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-tiny font-medium ${ref.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                            {ref.status === 'active' ? t('referrals.status_active') : t('referrals.status_pending')}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-white/40 tabular-nums">
                          {new Date(ref.date).toLocaleDateString(getSiteLanguageLocale(getSiteLanguage()))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-white/30 italic">
                        {t('referrals.no_referrals')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {boostModalOpen && (
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
                onClick={() => setBoostModalOpen(false)}
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
                    onClick={() => void startManualBoostStep(step)}
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
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .referral-bonus-button {
          animation: referralBonusBreath 3.2s ease-in-out infinite;
        }
        .referral-bonus-button::before {
          content: '';
          position: absolute;
          inset: 1px;
          border-radius: inherit;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 45%, rgba(250,204,21,0.14) 52%, transparent 62%);
          opacity: 0;
          transform: translateX(-130%);
          animation: referralBonusSoftSweep 3.2s ease-in-out infinite;
        }
        .referral-bonus-button::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(250,204,21,0.12);
          box-shadow: inset 0 0 12px rgba(125,211,252,0.08);
        }
        @keyframes referralBonusBreath {
          0%, 100% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.13), 0 12px 28px rgba(0,0,0,0.26), 0 0 16px rgba(125,211,252,0.10);
          }
          50% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 14px 30px rgba(0,0,0,0.28), 0 0 22px rgba(250,204,21,0.16);
          }
        }
        @keyframes referralBonusSoftSweep {
          0%, 58% {
            opacity: 0;
            transform: translateX(-130%);
          }
          68% {
            opacity: 0.65;
          }
          82%, 100% {
            opacity: 0;
            transform: translateX(130%);
          }
        }
      `}</style>
    </div>
  );
}


