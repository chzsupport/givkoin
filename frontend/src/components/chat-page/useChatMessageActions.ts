'use client';

import { useCallback } from 'react';

type ChatMessageActionSocket = {
  emit(event: 'send_message', payload: { chatId: unknown; text: string }): void;
  emit(event: 'typing' | 'stop_typing', payload: { chatId: unknown }): void;
};

type UseChatMessageActionsOptions = {
  chatId: unknown;
  onActivity: () => void;
  socket: ChatMessageActionSocket | null;
};

export function useChatMessageActions({
  chatId,
  onActivity,
  socket,
}: UseChatMessageActionsOptions) {
  const handleSendMessage = useCallback((text: string) => {
    if (!socket || !chatId) return;
    onActivity();
    socket.emit('send_message', { chatId, text });
  }, [chatId, onActivity, socket]);

  const handleTyping = useCallback(() => {
    if (!socket || !chatId) return;
    onActivity();
    socket.emit('typing', { chatId });
  }, [chatId, onActivity, socket]);

  const handleStopTyping = useCallback(() => {
    if (!socket || !chatId) return;
    socket.emit('stop_typing', { chatId });
  }, [chatId, socket]);

  return {
    handleSendMessage,
    handleStopTyping,
    handleTyping,
  };
}
