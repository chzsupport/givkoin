import { useEffect, useState } from 'react';
import { ChevronRight, DollarSign, MessageSquare, Shield, Users, Zap } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../api/client';
import { fetchLogs } from '../api/admin';
import { Badge, Card } from '../components/ui';

function DashboardSection({ stats }: { stats: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [adStats, setAdStats] = useState({ revenue: 0, impressions: 0 });
  const [recentBattles, setRecentBattles] = useState<any[]>([]);

  useEffect(() => {
    fetchLogs({ limit: 5 }).then(data => setLogs(data.logs || []));
    // Fetch ad stats
    api.get('/ads/stats').then(res => {
      setAdStats({
        revenue: (res.data?.totals?.potentialRevenue ?? res.data?.totals?.revenue ?? 0),
        impressions: res.data?.totals?.impressions || 0
      });
    }).catch(() => { });
    // Fetch battles
    api.get('/admin/battles').then(res => {
      setRecentBattles((res.data?.battles || res.data || []).slice(0, 3));
    }).catch(() => { });
  }, []);

  const chartData = stats?.activityChart || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-blue-500/20 p-2 text-blue-400">
              <Users size={20} />
            </div>
            <Badge variant="success">+12%</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Всего пользователей</p>
            <h4 className="text-2xl font-bold text-white">{stats?.totalUsers || 0}</h4>
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400">
              <DollarSign size={20} />
            </div>
            <Badge variant="success">30 дней</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Реклама (Потенциал / Показы)</p>
            <div className="flex items-baseline gap-2">
              <h4 className="text-2xl font-bold text-white">${adStats.revenue.toFixed(2)}</h4>
              <span className="text-sm text-slate-500">/ {adStats.impressions}</span>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-400">
              <MessageSquare size={20} />
            </div>
            <Badge variant="warning">{stats?.activeAppeals || 0} новых</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Активные апелляции</p>
            <h4 className="text-2xl font-bold text-white">{stats?.activeAppeals || 0}</h4>
          </div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-rose-500/20 p-2 text-rose-400">
              <Zap size={20} />
            </div>
            <Badge variant="error">Мрак активен</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-400">Новых юзеров сегодня</p>
            <h4 className="text-2xl font-bold text-white">{stats?.newUsersToday || 0}</h4>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Последние бои с Мраком" subtitle="История защиты Древа" className="lg:col-span-1">
          <div className="space-y-3">
            {recentBattles.length === 0 ? (
              <p className="text-center py-4 text-slate-500">Нет данных</p>
            ) : recentBattles.map((battle: any) => (
              <div key={battle._id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div>
                  <p className="text-sm font-medium text-white">{new Date(battle.createdAt).toLocaleDateString('ru')}</p>
                  <p className="text-xs text-slate-500">{battle.participants?.length || 0} участников</p>
                </div>
                <Badge variant={battle.result === 'victory' ? 'success' : 'error'}>
                  {battle.result === 'victory' ? 'Победа' : 'Поражение'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Активность сообщества" subtitle="Динамика регистраций и начисления K">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="users" stroke="#3b82f6" fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Последние действия" subtitle="Лог модерации и системных событий">
          <div className="space-y-4">
            {logs.length === 0 ? (
              <p className="text-center py-10 text-slate-500">Нет записей</p>
            ) : logs.map((log) => (
              <div key={log._id} className="flex items-center gap-4 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-slate-400">
                  <Shield size={18} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-white">
                    {log.user?.nickname || 'Система'}: {log.action}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default DashboardSection;
