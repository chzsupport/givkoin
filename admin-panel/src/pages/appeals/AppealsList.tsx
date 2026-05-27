import { CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { getAppealComplainant, getAppealStatusMeta, getPartyNickname } from './appealHelpers';
import type { Appeal, AppealAction } from './appealTypes';

export function AppealsList({
  appeals,
  loading,
  onViewChat,
  onAction,
}: {
  appeals: Appeal[];
  loading: boolean;
  onViewChat: (appeal: Appeal) => void;
  onAction: (id: string, action: AppealAction) => void;
}) {
  if (loading) {
    return <div className="text-center py-10 text-slate-500">Загрузка...</div>;
  }

  if (appeals.length === 0) {
    return <div className="text-center py-10 text-slate-500">Нет активных апелляций</div>;
  }

  return (
    <div className="grid gap-6">
      {appeals.map((appeal) => {
        const complainant = getAppealComplainant(appeal);
        const statusMeta = getAppealStatusMeta(appeal.status);

        return (
          <Card key={appeal._id} className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold">
                  {getPartyNickname(complainant)?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="font-semibold text-white">{getPartyNickname(complainant) || 'Неизвестный'}</div>
                  <div className="text-xs text-slate-500">{new Date(appeal.createdAt || '').toLocaleString()}</div>
                </div>
                <Badge variant={statusMeta.variant}>
                  {statusMeta.label}
                </Badge>
              </div>
              <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                <p className="font-semibold text-white mb-2">Причина апелляции:</p>
                {appeal.reason}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 md:w-64">
              <button
                onClick={() => onViewChat(appeal)}
                className="btn-secondary"
              >
                <MessageSquare size={18} />
                Смотреть чат
              </button>
              {appeal.status === 'pending' && (
                <>
                  <button
                    onClick={() => onAction(appeal._id, 'confirm')}
                    className="btn-primary bg-rose-600 hover:bg-rose-500"
                  >
                    <CheckCircle2 size={18} />
                    Подтвердить бан
                  </button>
                  <button
                    onClick={() => onAction(appeal._id, 'decline')}
                    className="btn-secondary border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    <XCircle size={18} />
                    Отменить бан
                  </button>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
