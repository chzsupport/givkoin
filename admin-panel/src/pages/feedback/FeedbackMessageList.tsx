import { formatFeedbackDate, getFeedbackPreview } from './feedbackHelpers';
import type { FeedbackMessage, FeedbackStatus } from './feedbackTypes';

export function FeedbackMessageList({
  loading,
  items,
  status,
  archivingId,
  deletingId,
  onArchive,
  onDelete,
  onOpen,
}: {
  loading: boolean;
  items: FeedbackMessage[];
  status: FeedbackStatus;
  archivingId: string | null;
  deletingId: string | null;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (message: FeedbackMessage) => void;
}) {
  if (loading) {
    return <div className="text-center py-10 text-slate-500">Загрузка...</div>;
  }

  if (items.length === 0) {
    return <div className="text-center py-10 text-slate-500">Сообщений нет</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((message) => (
        <div key={message._id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0">
              <div className="text-white font-semibold truncate">{message.name || '—'}</div>
              <div className="text-sm text-slate-400 break-all">{message.email}</div>
              <div className="text-xs text-slate-500">{formatFeedbackDate(message.createdAt)}</div>
              {message.repliedAt && (
                <div className="text-xs text-emerald-400">
                  Ответ отправлен: {formatFeedbackDate(message.repliedAt)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {status === 'new' && (
                <button
                  onClick={() => onArchive(message._id)}
                  disabled={archivingId === message._id}
                  className="btn-secondary"
                >
                  {archivingId === message._id ? '...' : 'В архив'}
                </button>
              )}
              <button
                onClick={() => onOpen(message)}
                className="btn-primary"
              >
                Открыть
              </button>
              <button
                onClick={() => onDelete(message._id)}
                disabled={deletingId === message._id}
                className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
              >
                {deletingId === message._id ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>

          <div className="mt-3 text-sm text-slate-300 leading-relaxed">
            {getFeedbackPreview(message.message)}
          </div>
        </div>
      ))}
    </div>
  );
}
