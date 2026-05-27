import { Badge, Card } from '../../components/ui';
import { TndStatCard } from './TndUi';
import type { TndReferralData } from './tndTypes';

const REFERRAL_STATUS_FILTERS = [
  { key: '', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'inactive', label: 'Не прошли' },
  { key: 'pending', label: 'Ожидают' },
];

export function TndReferralsTab({
  referrals,
  referralStatus,
  referralPage,
  onReferralStatusChange,
  onReferralPageChange,
}: {
  referrals: TndReferralData;
  referralStatus: string;
  referralPage: number;
  onReferralStatusChange: (status: string) => void;
  onReferralPageChange: (page: number) => void;
}) {
  const rows = referrals.rows || [];
  const topReferrers = referrals.topReferrers || [];
  const totalPages = referrals.pagination?.totalPages || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {REFERRAL_STATUS_FILTERS.map((item) => (
          <button
            key={item.key || 'all'}
            onClick={() => {
              onReferralPageChange(1);
              onReferralStatusChange(item.key);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${referralStatus === item.key
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <TndStatCard label="Всего рефералов" value={referrals.total || 0} />
        <TndStatCard label="Активные" value={referrals.active || 0} tone="green" />
        <TndStatCard label="Не прошли" value={referrals.inactive || 0} tone="red" />
        <TndStatCard label="Ожидают" value={referrals.pending || 0} tone="amber" />
      </div>

      <Card>
        <h3 className="mb-4 text-lg font-semibold text-white">Лучшие по активным рефералам</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topReferrers.map((row, index) => (
            <div key={row.user?._id || index} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">#{index + 1}</div>
              <div className="mt-1 font-semibold text-white">{row.user?.nickname || row.user?._id || '—'}</div>
              <div className="text-xs text-slate-500">{row.user?.email || '—'}</div>
              <div className="mt-3 text-2xl font-bold text-emerald-300">{row.activeReferrals || 0}</div>
            </div>
          ))}
          {topReferrers.length === 0 && <div className="text-slate-500">Активных рефералов пока нет</div>}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Пригласил</th>
                <th className="px-4 py-3">Реферал</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Причина</th>
                <th className="px-4 py-3">Дни</th>
                <th className="px-4 py-3">Траты / заработки</th>
                <th className="px-4 py-3">Бои</th>
                <th className="px-4 py-3">Посты</th>
                <th className="px-4 py-3">Сущность</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.inviter?.nickname || '—'}</div>
                    <div className="text-xs text-slate-500">{row.inviter?.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.invitee?.nickname || '—'}</div>
                    <div className="text-xs text-slate-500">{row.invitee?.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.status === 'active' ? 'success' : row.status === 'inactive' ? 'error' : 'warning'}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-3 max-w-[260px] text-slate-400">{row.checkReason || '—'}</td>
                  <td className="px-4 py-3 text-white">{row.activitySummary?.visitDays || 0}</td>
                  <td className="px-4 py-3 text-white">{row.activitySummary?.kDebitActions || 0} / {row.activitySummary?.kCreditActions || 0}</td>
                  <td className="px-4 py-3 text-white">{row.activitySummary?.battleParticipations || 0} / {row.activitySummary?.bigBattleRewards || 0}</td>
                  <td className="px-4 py-3 text-white">{row.activitySummary?.newsViews || 0}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.activitySummary?.hasEntity ? 'success' : 'warning'}>{row.activitySummary?.hasEntity ? 'Есть' : 'Нет'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="py-10 text-center text-slate-500">Рефералов по фильтру нет</div>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <button className="btn-secondary" disabled={referralPage <= 1} onClick={() => onReferralPageChange(Math.max(1, referralPage - 1))}>Назад</button>
        <span className="text-sm text-slate-400">{referrals.pagination?.page || 1} / {totalPages}</span>
        <button className="btn-secondary" disabled={referralPage >= totalPages} onClick={() => onReferralPageChange(referralPage + 1)}>Вперёд</button>
      </div>
    </div>
  );
}
