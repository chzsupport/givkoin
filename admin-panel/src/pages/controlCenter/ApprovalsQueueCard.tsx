import { RefreshCw } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { formatAdminUiStatus } from './controlCenterHelpers';
import type { ApprovalItem } from './controlCenterTypes';

export function ApprovalsQueueCard({
  approvals,
  showAllApprovals,
  actionBusyId,
  onShowAllApprovalsChange,
  onReload,
  onApprove,
  onReject,
}: {
  approvals: ApprovalItem[];
  showAllApprovals: boolean;
  actionBusyId: string | null;
  onShowAllApprovalsChange: (value: boolean) => void;
  onReload: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <Card title="Срочно" subtitle="Очередь опасных действий, которые ждут решения">
      <div className="mb-4 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={showAllApprovals}
            onChange={(e) => onShowAllApprovalsChange(e.target.checked)}
          />
          Показывать не только ожидающие
        </label>
        <button
          onClick={onReload}
          className="btn-secondary"
        >
          <RefreshCw size={16} />
          Обновить
        </button>
      </div>

      <div className="space-y-3">
        {approvals.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            В очереди подтверждений нет операций.
          </div>
        ) : approvals.map((approval) => (
          <div key={approval.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={approval.status === 'pending' ? 'warning' : approval.status === 'executed' ? 'success' : approval.status === 'failed' ? 'error' : 'info'}>
                    {formatAdminUiStatus(String(approval.status || ''))}
                  </Badge>
                </div>
                <div className="text-sm text-white">{approval.actionType}</div>
                <div className="text-xs text-slate-400">Причина: {approval.reason || '—'}</div>
                <div className="text-xs text-slate-500">
                  {approval.createdAt ? new Date(approval.createdAt).toLocaleString('ru-RU') : '—'}
                </div>
                <div className="text-xs text-slate-500">
                  Подтверждений: {Array.isArray(approval.approvals) ? approval.approvals.length : 0}
                </div>
              </div>

              {approval.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onApprove(approval.id)}
                    disabled={actionBusyId === `approve-${approval.id}` || actionBusyId === `reject-${approval.id}`}
                    className="btn-primary"
                  >
                    Подтвердить
                  </button>
                  <button
                    onClick={() => onReject(approval.id)}
                    disabled={actionBusyId === `approve-${approval.id}` || actionBusyId === `reject-${approval.id}`}
                    className="btn-secondary text-rose-300"
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
