import { Card } from '../../components/ui';
import { formatCountry, formatDevice, formatDuration } from './adFormatters';
import type { AdsStats } from './adTypes';

export function AdsDailyStatsTable({ stats }: { stats: AdsStats | null }) {
  const daily = stats?.daily || [];

  return (
    <Card title="Статистика по дням" subtitle="Показы и доход за последние 30 дней">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
              <th className="pb-3 font-medium">Дата</th>
              <th className="pb-3 font-medium">Показов</th>
              <th className="pb-3 font-medium">Средний SCM</th>
              <th className="pb-3 font-medium">Доход</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {daily.map((day) => (
              <tr key={day.date} className="text-sm">
                <td className="py-3 text-white">{day.date}</td>
                <td className="py-3 text-slate-300">{day.impressions.toLocaleString()}</td>
                <td className="py-3 text-slate-300">${day.avgAdRate}</td>
                <td className="py-3 text-emerald-400">${day.revenue}</td>
              </tr>
            ))}
            {daily.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-slate-500">Нет данных о показах</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdsTimeByPageTable({ stats }: { stats: AdsStats | null }) {
  const rows = stats?.timeByPage || [];

  return (
    <Card title="Время по страницам" subtitle="Суммарное время по всем пользователям">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
              <th className="pb-3 font-medium">Страница</th>
              <th className="pb-3 font-medium">Общее время</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={row.page} className="text-sm">
                <td className="py-3 text-white">{row.page}</td>
                <td className="py-3 text-slate-300">{formatDuration(row.totalDurationSeconds || 0)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={2} className="py-8 text-center text-slate-500">Нет данных по времени на страницах</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdsTimeBreakdownTables({ stats }: { stats: AdsStats | null }) {
  const countryRows = stats?.timeByCountry || [];
  const deviceRows = stats?.timeByDevice || [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Время по странам">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Страна</th>
                <th className="pb-3 font-medium">Сессий</th>
                <th className="pb-3 font-medium">Общее время</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {countryRows.map((row) => (
                <tr key={row.country} className="text-sm">
                  <td className="py-3 text-white">{formatCountry(row.country)}</td>
                  <td className="py-3 text-slate-300">{(row.sessions || 0).toLocaleString()}</td>
                  <td className="py-3 text-slate-300">{formatDuration(row.totalDurationSeconds || 0)}</td>
                </tr>
              ))}
              {countryRows.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-slate-500">Нет данных по странам</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Время по устройствам">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Устройство</th>
                <th className="pb-3 font-medium">Сессий</th>
                <th className="pb-3 font-medium">Общее время</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {deviceRows.map((row) => (
                <tr key={row.device} className="text-sm">
                  <td className="py-3 text-white">{formatDevice(row.device)}</td>
                  <td className="py-3 text-slate-300">{(row.sessions || 0).toLocaleString()}</td>
                  <td className="py-3 text-slate-300">{formatDuration(row.totalDurationSeconds || 0)}</td>
                </tr>
              ))}
              {deviceRows.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-slate-500">Нет данных по устройствам</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
