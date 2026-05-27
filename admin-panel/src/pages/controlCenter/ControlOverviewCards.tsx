import { Card } from '../../components/ui';
import type { CriticalAction, SystemOverview } from './controlCenterTypes';

export function ControlOverviewCards({
  overview,
  criticalActions,
}: {
  overview: SystemOverview | null;
  criticalActions: CriticalAction[];
}) {
  const incidents = overview?.incidents || {};

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="flex flex-col justify-between">
        <div className="text-sm text-slate-400">Ожидают подтверждения</div>
        <div className="mt-3 text-3xl font-bold text-amber-400">{incidents.pendingApprovals || 0}</div>
      </Card>
      <Card className="flex flex-col justify-between">
        <div className="text-sm text-slate-400">Проваленные операции</div>
        <div className="mt-3 text-3xl font-bold text-rose-400">{incidents.failedApprovals || 0}</div>
      </Card>
      <Card className="flex flex-col justify-between">
        <div className="text-sm text-slate-400">Критичные действия (10)</div>
        <div className="mt-3 text-3xl font-bold text-white">{criticalActions.length}</div>
      </Card>
      <Card className="flex flex-col justify-between">
        <div className="text-sm text-slate-400">Последнее обновление</div>
        <div className="mt-3 text-sm font-medium text-white">
          {overview?.generatedAt ? new Date(overview.generatedAt).toLocaleString('ru-RU') : '—'}
        </div>
      </Card>
    </div>
  );
}
