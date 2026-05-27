import { RefreshCw } from 'lucide-react';
import type { FeedbackStatus } from './feedbackTypes';

export function FeedbackHeader({
  status,
  onStatusChange,
  onReload,
}: {
  status: FeedbackStatus;
  onStatusChange: (status: FeedbackStatus) => void;
  onReload: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="text-xl font-bold text-white">Обратная связь</h2>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onStatusChange('new')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${status === 'new'
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-white border border-white/10'
            }`}
        >
          Новые
        </button>
        <button
          onClick={() => onStatusChange('archived')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${status === 'archived'
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:bg-white/5 hover:text-white border border-white/10'
            }`}
        >
          Архив
        </button>
        <button onClick={onReload} className="btn-secondary">
          <RefreshCw size={18} />
          Обновить
        </button>
      </div>
    </div>
  );
}
