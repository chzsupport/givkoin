import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import type { ReferralStats, ReferralText } from './types';

type ReferralStatsPanelProps = {
  loadingMore: boolean;
  onLoadMore: () => void;
  stats: ReferralStats | null;
  t: ReferralText;
};

export function ReferralStatsPanel({ loadingMore, onLoadMore, stats, t }: ReferralStatsPanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
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

      <div className="bg-white/5 px-6 py-2 border-b border-white/10">
        <h3 className="text-tiny font-bold text-white/60 uppercase tracking-widest">{t('referrals.last_registrations')}</h3>
      </div>

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
                      }`}
                    >
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
      {stats?.hasMore && (
        <div className="border-t border-white/10 px-6 py-4 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loadingMore ? t('common.loading') : t('referrals.show_more')}
          </button>
        </div>
      )}
    </div>
  );
}
