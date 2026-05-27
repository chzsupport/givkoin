import { AnimatePresence, motion } from 'framer-motion';
import { formatFeedbackDate } from './feedbackHelpers';
import type { FeedbackMessage, FeedbackStatus } from './feedbackTypes';

export function FeedbackMessageModal({
  selected,
  status,
  replySubject,
  replyMessage,
  archivingId,
  deletingId,
  replyingId,
  onClose,
  onReplySubjectChange,
  onReplyMessageChange,
  onArchive,
  onDelete,
  onReply,
}: {
  selected: FeedbackMessage | null;
  status: FeedbackStatus;
  replySubject: string;
  replyMessage: string;
  archivingId: string | null;
  deletingId: string | null;
  replyingId: string | null;
  onClose: () => void;
  onReplySubjectChange: (value: string) => void;
  onReplyMessageChange: (value: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onReply: () => void;
}) {
  return (
    <AnimatePresence>
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-white/10 p-6 max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-white">Письмо</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-1 mb-4">
              <div className="text-white font-semibold">{selected.name || '—'}</div>
              <div className="text-sm text-slate-400 break-all">{selected.email}</div>
              <div className="text-xs text-slate-500">
                {formatFeedbackDate(selected.createdAt)}
              </div>
              {selected.repliedAt && (
                <div className="text-xs text-emerald-400">
                  Ответ отправлен: {formatFeedbackDate(selected.repliedAt)}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4 whitespace-pre-wrap text-sm text-slate-100 leading-relaxed mb-5">
              {selected.message}
            </div>

            <div className="grid gap-3 mb-5">
              <input
                className="input-field"
                value={replySubject}
                onChange={(event) => onReplySubjectChange(event.target.value)}
                placeholder="Тема ответа (необязательно)"
              />
              <textarea
                className="input-field min-h-[120px]"
                value={replyMessage}
                onChange={(event) => onReplyMessageChange(event.target.value)}
                placeholder="Текст ответа"
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              {status === 'new' && (
                <button
                  onClick={() => onArchive(selected._id)}
                  disabled={archivingId === selected._id}
                  className="btn-secondary"
                >
                  {archivingId === selected._id ? '...' : 'В архив'}
                </button>
              )}
              <button
                onClick={onReply}
                disabled={replyingId === selected._id}
                className="btn-primary"
              >
                {replyingId === selected._id ? 'Отправка...' : 'Ответить'}
              </button>
              <button
                onClick={() => onDelete(selected._id)}
                disabled={deletingId === selected._id}
                className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
              >
                {deletingId === selected._id ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
