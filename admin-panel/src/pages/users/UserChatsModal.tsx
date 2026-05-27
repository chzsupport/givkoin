import { AnimatePresence, motion } from 'framer-motion';
import type { AdminUser, ChatMessage } from './userTypes';

export function UserChatsModal({
  showChats,
  userChats,
  chatLoading,
  onClose,
}: {
  showChats: AdminUser | null;
  userChats: ChatMessage[];
  chatLoading: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {showChats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl glass-panel p-8 max-h-[80vh] flex flex-col"
          >
            <h3 className="text-xl font-bold text-white mb-6">История сообщений: {showChats.nickname}</h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {chatLoading ? (
                <p className="text-center py-10 text-slate-500">Загрузка...</p>
              ) : userChats.length === 0 ? (
                <p className="text-center py-10 text-slate-500">Сообщений не найдено</p>
              ) : userChats.map((msg) => (
                <div key={msg._id} className="rounded-xl bg-white/5 p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-blue-400">{msg.sender?.nickname || 'Неизвестный'}</span>
                    <span className="text-caption text-slate-500">{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '—'}</span>
                  </div>
                  <p className="text-sm text-slate-300">{msg.content}</p>
                  {msg.translatedContent && (
                    <p className="text-xs text-slate-500 mt-2 italic border-t border-white/5 pt-2">
                      Перевод: {msg.translatedContent}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="btn-secondary mt-6 w-full"
            >
              Закрыть
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
