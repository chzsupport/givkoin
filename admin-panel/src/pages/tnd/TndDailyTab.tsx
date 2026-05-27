import { Badge, Card } from '../../components/ui';
import { formatAdminK } from '../../utils/adminFormat';
import { TndStatCard } from './TndUi';
import type { TndDailyData } from './tndTypes';

export function TndDailyTab({
  daily,
  dayKey,
  dailyPage,
  onDayKeyChange,
  onDailyPageChange,
}: {
  daily: TndDailyData;
  dayKey: string;
  dailyPage: number;
  onDayKeyChange: (dayKey: string) => void;
  onDailyPageChange: (page: number) => void;
}) {
  const rows = daily.rows || [];
  const totalPages = daily.pagination?.totalPages || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-slate-400">
          День проверки
          <input
            type="date"
            value={dayKey}
            onChange={(event) => {
              onDailyPageChange(1);
              onDayKeyChange(event.target.value);
            }}
            className="input-field mt-2 max-w-xs"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <TndStatCard label="Проверено" value={daily.totalReports || 0} />
        <TndStatCard label="Прошли" value={daily.passed || 0} tone="green" />
        <TndStatCard label="Не прошли" value={daily.failed || 0} tone="red" />
        <TndStatCard label="Активных аккаунтов" value={daily.activeUsersTotal || 0} tone="slate" />
        <TndStatCard label="Ещё без отчёта" value={daily.uncheckedActiveUsers || 0} tone="amber" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Юзер</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Причина</th>
                <th className="px-4 py-3">Минуты</th>
                <th className="px-4 py-3">K-действия</th>
                <th className="px-4 py-3">Страницы</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row._id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.user?.nickname || row.user?._id || '—'}</div>
                    <div className="text-xs text-slate-500">{row.user?.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.passed ? 'success' : 'error'}>{row.passed ? 'Прошёл' : 'Не прошёл'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{row.reason || '—'}</td>
                  <td className="px-4 py-3 text-white">{formatAdminK(row.summary?.minutesTotal || 0)}</td>
                  <td className="px-4 py-3 text-white">{row.summary?.kActionCount || 0}</td>
                  <td className="px-4 py-3 text-white">{row.summary?.pagesVisited || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="py-10 text-center text-slate-500">Отчётов за этот день пока нет</div>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <button className="btn-secondary" disabled={dailyPage <= 1} onClick={() => onDailyPageChange(Math.max(1, dailyPage - 1))}>Назад</button>
        <span className="text-sm text-slate-400">{daily.pagination?.page || 1} / {totalPages}</span>
        <button className="btn-secondary" disabled={dailyPage >= totalPages} onClick={() => onDailyPageChange(dailyPage + 1)}>Вперёд</button>
      </div>
    </div>
  );
}
