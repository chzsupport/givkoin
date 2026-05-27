import { AnimatePresence, motion } from 'framer-motion';
import { getPartyDisplayName, getPartyId } from './appealHelpers';
import type { Appeal, AppealMessage } from './appealTypes';

export function AppealChatModal({
  appeal,
  chatMessages,
  chatLoading,
  onClose,
}: {
  appeal: Appeal | null;
  chatMessages: AppealMessage[];
  chatLoading: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {appeal && (
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
            className="relative w-full max-w-2xl glass-panel p-6 max-h-[85vh] flex flex-col"
          >
            <div className="mb-4 pb-4 border-b border-white/10">
              <h3 className="text-xl font-bold text-white mb-3">Просмотр переписки</h3>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Жалобщик:</span>
                  <span className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-medium">
                    {getPartyDisplayName(appeal.complainant)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Обвиняемый:</span>
                  <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-medium">
                    {getPartyDisplayName(appeal.againstUser)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Причина:</span>
                  <span className="text-white">{appeal.reason || 'Не указана'}</span>
                </div>
                {appeal.appealText && (
                  <div className="mt-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="text-xs text-blue-400 mb-1">Текст оспаривания от обвиняемого:</div>
                    <div className="text-sm text-white italic">"{appeal.appealText}"</div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
              {chatLoading ? (
                <p className="text-center py-10 text-slate-500">Загрузка...</p>
              ) : chatMessages.length === 0 ? (
                <p className="text-center py-10 text-slate-500">Сообщений не найдено</p>
              ) : chatMessages.map((msg, idx) => {
                const isComplainant = msg.sender === getPartyId(appeal.complainant);
                const isAccused = msg.sender === getPartyId(appeal.againstUser);

                return (
                  <div
                    key={idx}
                    className={`flex ${isComplainant ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 ${isComplainant
                        ? 'bg-rose-500/20 border border-rose-500/30 rounded-bl-sm'
                        : 'bg-amber-500/20 border border-amber-500/30 rounded-br-sm'
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-caption font-bold ${isComplainant ? 'text-rose-400' : 'text-amber-400'}`}>
                          {isComplainant ? '👤 Жалобщик' : isAccused ? '⚠️ Обвиняемый' : 'Участник'}
                        </span>
                        <span className="text-caption text-slate-500">
                          {new Date(msg.sentAt || msg.createdAt || '').toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-white">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onClose}
              className="btn-secondary w-full"
            >
              Закрыть
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
