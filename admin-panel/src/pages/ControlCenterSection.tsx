import { useEffect, useState } from 'react';
import {
  approveApprovalV2,
  fetchApprovalsV2,
  fetchSystemJobsV2,
  fetchSystemOverviewV2,
  rejectApprovalV2,
  runSystemJobV2,
} from '../api/admin';
import { ApprovalsQueueCard } from './controlCenter/ApprovalsQueueCard';
import { ControlOverviewCards } from './controlCenter/ControlOverviewCards';
import { CriticalActionsCard } from './controlCenter/CriticalActionsCard';
import { SystemJobsCards } from './controlCenter/SystemJobsCards';
import type {
  ApprovalItem,
  CriticalAction,
  RequestApprovalPayload,
  SystemJob,
  SystemJobRun,
  SystemOverview,
} from './controlCenter/controlCenterTypes';

function ControlCenterSection({
  requestApprovalPayload,
}: {
  requestApprovalPayload: RequestApprovalPayload;
}) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [jobs, setJobs] = useState<SystemJob[]>([]);
  const [recentRuns, setRecentRuns] = useState<SystemJobRun[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [showAllApprovals, setShowAllApprovals] = useState(false);

  const loadData = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const [overviewData, approvalsData, jobsData] = await Promise.all([
        fetchSystemOverviewV2(),
        fetchApprovalsV2({
          status: showAllApprovals ? undefined : 'pending',
          limit: 30,
        }),
        fetchSystemJobsV2({ limit: 20 }),
      ]);
      setOverview(overviewData || null);
      setApprovals(Array.isArray(approvalsData?.approvals) ? approvalsData.approvals : []);
      setJobs(Array.isArray(jobsData?.jobs) ? jobsData.jobs : []);
      setRecentRuns(Array.isArray(jobsData?.recentRuns) ? jobsData.recentRuns : []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [showAllApprovals]);

  const handleApprove = async (id: string) => {
    const note = prompt('Комментарий к подтверждению (необязательно):', 'Подтверждено');
    setActionBusyId(`approve-${id}`);
    try {
      const res = await approveApprovalV2(id, String(note || '').trim());
      alert(`Операция ${res.operationId || id}: статус ${res.status}`);
      await loadData({ silent: true });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось подтвердить операцию');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Причина отклонения:');
    if (!reason || !reason.trim()) return;
    setActionBusyId(`reject-${id}`);
    try {
      const res = await rejectApprovalV2(id, reason.trim());
      alert(`Операция ${res.operationId || id}: отклонена`);
      await loadData({ silent: true });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось отклонить операцию');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleBackupRequest = async () => {
    const approvalPayload = requestApprovalPayload({
      title: 'Создание полной резервной копии',
      impactPreviewDefault: 'Будет создан архив со снимком данных проекта.',
      confirmationPhrase: 'CONFIRM system.backup.create',
    });
    if (!approvalPayload) return;

    setActionBusyId('job-backup_full');
    try {
      const res = await runSystemJobV2('backup_full', approvalPayload);
      if (res?.requiresApproval) {
        alert(`Заявка создана. Номер операции: ${res.operationId}`);
      } else {
        alert(`Задача запущена. Статус: ${res.status}`);
      }
      await loadData({ silent: true });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось создать задачу резервной копии');
    } finally {
      setActionBusyId(null);
    }
  };

  const criticalActions: CriticalAction[] = Array.isArray(overview?.criticalActions) ? overview.criticalActions : [];

  if (loading) return <div className="text-center py-10 text-slate-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <ControlOverviewCards overview={overview} criticalActions={criticalActions} />

      <ApprovalsQueueCard
        approvals={approvals}
        showAllApprovals={showAllApprovals}
        actionBusyId={actionBusyId}
        onShowAllApprovalsChange={setShowAllApprovals}
        onReload={() => loadData({ silent: true })}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      <SystemJobsCards
        jobs={jobs}
        recentRuns={recentRuns}
        actionBusyId={actionBusyId}
        onBackupRequest={handleBackupRequest}
      />

      <CriticalActionsCard criticalActions={criticalActions} />
    </div>
  );
}

export default ControlCenterSection;
