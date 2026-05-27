import { Card } from '../../components/ui';
import type { CriticalAction } from './controlCenterTypes';

export function CriticalActionsCard({ criticalActions }: { criticalActions: CriticalAction[] }) {
  return (
    <Card title="Последние критичные действия" subtitle="Кто и что менял в системе">
      <div className="space-y-3">
        {criticalActions.length === 0 ? (
          <div className="text-sm text-slate-500">Критичных действий пока нет.</div>
        ) : criticalActions.map((item) => (
          <div key={item._id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-white">{item.actionType}</div>
              <div className="text-xs text-slate-500">
                {item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '—'}
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {item.actor?.nickname || item.actor?.email || 'Система'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
