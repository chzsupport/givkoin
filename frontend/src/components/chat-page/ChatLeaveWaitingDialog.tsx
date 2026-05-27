'use client';

type ChatLeaveWaitingDialogProps = {
  t: (key: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChatLeaveWaitingDialog({
  t,
  onCancel,
  onConfirm,
}: ChatLeaveWaitingDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-red-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{t('common.warning')}</h3>
          <p className="text-gray-300 mb-6">{t('chat.leave_waiting_penalty')}</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {t('common.stay')}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              {t('common.leave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
