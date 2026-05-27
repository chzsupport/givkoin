import { Badge, Card } from '../../components/ui';
import { formatAdminUiStatus } from './controlCenterHelpers';
import type { SystemJob, SystemJobRun } from './controlCenterTypes';

export function SystemJobsCards({
  jobs,
  recentRuns,
  actionBusyId,
  onBackupRequest,
}: {
  jobs: SystemJob[];
  recentRuns: SystemJobRun[];
  actionBusyId: string | null;
  onBackupRequest: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Системные задачи" subtitle="Запуск и контроль обслуживания проекта">
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.jobName} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">{job.title || job.jobName}</div>
                  <div className="text-xs text-slate-500">{job.jobName}</div>
                </div>
                {job.jobName === 'backup_full' ? (
                  <button
                    onClick={onBackupRequest}
                    disabled={actionBusyId === 'job-backup_full'}
                    className="btn-secondary"
                  >
                    Запросить запуск
                  </button>
                ) : (
                  <Badge variant={job.dangerous ? 'warning' : 'info'}>
                    {job.dangerous ? 'Опасная' : 'Обычная'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="text-sm text-slate-500">Системные задачи не найдены.</div>
          )}
        </div>
      </Card>

      <Card title="Последние запуски задач" subtitle="Состояние резервных копий и сервисных операций">
        <div className="space-y-3">
          {recentRuns.length === 0 ? (
            <div className="text-sm text-slate-500">Запусков пока нет.</div>
          ) : recentRuns.map((run) => (
            <div key={run.runId} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-white">{run.jobName}</div>
                  <div className="text-xs text-slate-500">
                    {run.createdAt ? new Date(run.createdAt).toLocaleString('ru-RU') : '—'}
                  </div>
                </div>
                <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'warning'}>
                  {formatAdminUiStatus(String(run.status || ''))}
                </Badge>
              </div>
              {run.result?.backupId && (
                <div className="mt-2 text-xs text-slate-400">
                  ID копии: {run.result.backupId}
                </div>
              )}
              {run.error && (
                <div className="mt-2 text-xs text-rose-400">
                  {run.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
