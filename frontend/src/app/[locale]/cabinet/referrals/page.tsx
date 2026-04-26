'use client';

import { useState, useEffect } from 'react';
import { PageBackground } from '@/components/PageBackground';
import { useAuth } from '@/context/AuthContext';
import { apiGet } from '@/utils/api';
import { PageTitle } from '@/components/PageTitle';
import { Users } from 'lucide-react';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import { useI18n } from '@/context/I18nContext';

type ReferralStats = {
  code: string;
  totalInvited: number;
  activeCount: number;
  totalEarned: number;
  referrals: Array<{ nickname: string; date: string; status: string }>;
};

export default function CabinetReferralsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);

  // Use user.nickname for the link if available, otherwise fallback or wait
  const referralLink = user?.nickname
    ? `${window.location.protocol}//${window.location.host}/ref/${user.nickname}`
    : t('common.loading');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiGet<ReferralStats>('/referrals');
        setStats(data);
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
      `}</style>
    </div>
  );
}


