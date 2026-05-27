import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { fetchReferrals } from '../api/admin';
import { Badge, Card } from '../components/ui';

function ReferralsSection() {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<{ active: number; pending: number; inactive: number }>({ active: 0, pending: 0, inactive: 0 });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const loadReferrals = async () => {
    setLoading(true);
    try {
      const data = await fetchReferrals({ page, limit: 20, search, status: status || undefined });
      setReferrals(data.referrals || []);
      setTotalPages(data.totalPages || 1);
      setTotalReferrals(data.totalReferrals || 0);
      setStatusCounts(data.statusCounts || { active: 0, pending: 0, inactive: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReferrals();
  }, [page, search, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, any>();
    referrals.forEach((ref) => {
      const key = ref.inviter?._id || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          inviter: ref.inviter || { nickname: 'Без пригласителя', email: '—', _id: key },
          referrals: [],
          total: 0,
          active: 0,
          pending: 0,
          inactive: 0,
        });
      }
      const g = map.get(key);
      g.referrals.push(ref);
      g.total += 1;
      if (ref.status === 'active') g.active += 1;
      else if (ref.status === 'pending') g.pending += 1;
      else g.inactive += 1;
    });
    return Array.from(map.values());
  }, [referrals]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Управление рефералами</h2>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Поиск по нику или email..."
            className="input-field pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: null, label: 'Все', count: statusCounts.active + statusCounts.pending + statusCounts.inactive },
          { key: 'active', label: 'Активные', count: statusCounts.active },
          { key: 'pending', label: 'Ожидают', count: statusCounts.pending },
          { key: 'inactive', label: 'Не прошли', count: statusCounts.inactive },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => { setPage(1); setStatus(item.key as any); }}
            className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${status === item.key || (item.key === null && status === null)
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
          >
            {item.label} ({item.count || 0})
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-600/20 to-transparent border-blue-500/20">
          <div className="text-center">
            <p className="text-sm text-slate-400">Всего рефералов</p>
            <h4 className="text-3xl font-bold text-white">{totalReferrals}</h4>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="space-y-4">
          {loading ? (
            <div className="py-10 text-center text-slate-500">Загрузка...</div>
          ) : grouped.length === 0 ? (
            <div className="py-10 text-center text-slate-500">Рефералов не найдено</div>
          ) : grouped.map((group) => {
            const isOpen = openGroups[group.inviter?._id || 'unknown'];
            return (
              <div key={group.inviter?._id || 'unknown'} className="rounded-2xl border border-white/10 bg-white/5">
                <button
                  onClick={() => toggleGroup(group.inviter?._id || 'unknown')}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/5"
                >
                  <div className="flex flex-col items-start">
                    <div className="text-lg font-semibold text-white">{group.inviter?.nickname || 'Без пригласителя'}</div>
                    <div className="text-xs text-slate-500">{group.inviter?.email || '—'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="success">Актив {group.active}</Badge>
                    <Badge variant="warning">Ожидают {group.pending}</Badge>
                    <Badge variant="error">Не прошли {group.inactive}</Badge>
                    <Badge variant="info">Всего {group.total}</Badge>
                    <ChevronRight className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} size={18} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-white/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-6 py-3">Дата</th>
                            <th className="px-6 py-3">Приглашенный</th>
                            <th className="px-6 py-3">Статус</th>
                            <th className="px-6 py-3">Проверка</th>
                            <th className="px-6 py-3">Активность 30д</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {group.referrals.map((ref: any) => (
                            <tr key={ref._id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 text-slate-400">
                                {new Date(ref.createdAt).toLocaleDateString()} <span className="text-xs">{new Date(ref.createdAt).toLocaleTimeString()}</span>
                              </td>
                              <td className="px-6 py-3">
                                <div className="font-medium text-emerald-400">{ref.invitee?.nickname || 'Неизвестный'}</div>
                                <div className="text-xs text-slate-500">{ref.invitee?.email}</div>
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex flex-col gap-1">
                                  <Badge variant={ref.status === 'active' ? 'success' : ref.status === 'inactive' ? 'error' : 'warning'}>
                                    {ref.status}
                                  </Badge>
                                  {ref.checkReason && <span className="text-xs text-slate-500 max-w-[180px] line-clamp-2">{ref.checkReason}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-3 text-slate-300">
                                <div className="text-xs">Проверен: {ref.checkedAt ? new Date(ref.checkedAt).toLocaleDateString() : '—'}</div>
                                <div className="text-xs text-slate-500">Активен с: {ref.activeSince ? new Date(ref.activeSince).toLocaleDateString() : '—'}</div>
                                <div className="text-caption text-slate-500">IP: {ref.inviteeIp || '—'}</div>
                                <div className="text-caption text-slate-500">FP: {ref.inviteeFingerprint ? ref.inviteeFingerprint.slice(0, 10) + '…' : '—'}</div>
                              </td>
                              <td className="px-6 py-3">
                                <div className="grid grid-cols-2 gap-2 text-caption text-white">
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-emerald-400 font-semibold">{ref.activitySummary?.visitDays ?? 0}</div>
                                    <div className="text-slate-500">дней входа</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-emerald-400 font-semibold">{ref.activitySummary?.minutesTotal ?? 0}</div>
                                    <div className="text-slate-500">минут</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-amber-400 font-semibold">{ref.activitySummary?.kDebitActions ?? 0}</div>
                                    <div className="text-slate-500">трат K</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-amber-400 font-semibold">{ref.activitySummary?.kCreditActions ?? 0}</div>
                                    <div className="text-slate-500">заработков K</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-amber-400 font-semibold">{ref.activitySummary?.battleParticipations ?? 0}</div>
                                    <div className="text-slate-500">бои</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-blue-400 font-semibold">{ref.activitySummary?.bigBattleRewards ?? 0}</div>
                                    <div className="text-slate-500">бой &gt;100 K</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-blue-400 font-semibold">{ref.activitySummary?.newsViews ?? 0}</div>
                                    <div className="text-slate-500">постов</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
                                    <div className="text-blue-400 font-semibold">{ref.activitySummary?.pagesVisited ?? 0}</div>
                                    <div className="text-slate-500">страниц</div>
                                  </div>
                                  <div className="rounded-lg bg-white/5 px-2 py-1 text-center col-span-2">
                                    <div className={`font-semibold ${ref.activitySummary?.hasEntity ? 'text-emerald-400' : 'text-slate-400'}`}>
                                      {ref.activitySummary?.hasEntity ? 'Сущность создана' : 'Сущность нет'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-white/10">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-secondary py-1 px-3 disabled:opacity-50"
            >
              Назад
            </button>
            <span className="text-sm text-slate-400">
              Страница {page} из {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary py-1 px-3 disabled:opacity-50"
            >
              Вперед
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default ReferralsSection;
