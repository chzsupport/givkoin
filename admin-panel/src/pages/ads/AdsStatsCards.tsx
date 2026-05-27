import { BarChart3, Clock, DollarSign, FileText, Globe, MonitorSmartphone } from 'lucide-react';
import { Card } from '../../components/ui';
import { formatDuration } from './adFormatters';
import type { AdsStats } from './adTypes';

export function AdsStatsCards({
  stats,
  creativesCount,
}: {
  stats: AdsStats | null;
  creativesCount: number;
}) {
  const totalSessionDuration = stats?.sessionTotals?.totalDurationSeconds || 0;
  const totalSessions = stats?.sessionTotals?.sessions || 0;
  const avgSessionDuration = stats?.sessionTotals?.avgDurationSeconds || 0;

  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <Card className="bg-gradient-to-br from-emerald-600/20 to-transparent border-emerald-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Потенциальный доход</p>
            <h4 className="text-2xl font-bold text-white">${(stats?.totals?.potentialRevenue ?? stats?.totals?.revenue ?? 0)}</h4>
          </div>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-blue-600/20 to-transparent border-blue-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Показов (всего)</p>
            <h4 className="text-2xl font-bold text-white">{(stats?.totals?.impressions || 0).toLocaleString()}</h4>
          </div>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-amber-600/20 to-transparent border-amber-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white">
            <Globe size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Стран</p>
            <h4 className="text-2xl font-bold text-white">{stats?.byCountry?.length || 0}</h4>
          </div>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-purple-600/20 to-transparent border-purple-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-white">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Креативов</p>
            <h4 className="text-2xl font-bold text-white">{creativesCount}</h4>
          </div>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-cyan-600/20 to-transparent border-cyan-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-600 text-white">
            <MonitorSmartphone size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Сессий</p>
            <h4 className="text-2xl font-bold text-white">{totalSessions.toLocaleString()}</h4>
          </div>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-indigo-600/20 to-transparent border-indigo-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Время в страницах</p>
            <h4 className="text-2xl font-bold text-white">{formatDuration(totalSessionDuration)}</h4>
          </div>
        </div>
      </Card>
      <Card className="bg-gradient-to-br from-fuchsia-600/20 to-transparent border-fuchsia-500/20">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-600 text-white">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Средняя сессия</p>
            <h4 className="text-2xl font-bold text-white">{formatDuration(avgSessionDuration)}</h4>
          </div>
        </div>
      </Card>
    </div>
  );
}
