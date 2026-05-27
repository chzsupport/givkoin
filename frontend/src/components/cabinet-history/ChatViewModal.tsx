'use client';

import { X } from 'lucide-react';
import { formatDateTime } from '@/utils/formatters';
import type { ChatMessage } from './types';

type ChatViewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  partnerName: string;
  t: (key: string) => string;
  language: string;
};

export function ChatViewModal({
  isOpen,
  onClose,
  messages,
  partnerName,
  t,
  language,
}: ChatViewModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-h3 text-white">{t('history.chat_with')} {partnerName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{t('history.no_messages')}</p>
          ) : (
            messages.map((message, idx) => (
              <div key={idx} className="rounded-lg bg-gray-800/50 p-3">
                <div className="flex items-center gap-2 text-tiny text-gray-500 mb-1">
                  <span className="font-medium text-gray-400">
                    {(message.sender || 'unknown') === 'unknown' ? t('history.participant') : String(message.sender).slice(-6)}
                  </span>
                  <span>•</span>
                  <span>{formatDateTime(message.sentAt, language)}</span>
                </div>
                <p className="text-white text-secondary">{message.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
