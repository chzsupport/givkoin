'use client';

import { useCallback, useState } from 'react';

type ChatRatingSocket = {
  emit: (event: 'rate_partner', payload: { chatId: unknown; rating: boolean }) => void;
};

type UseChatRatingFlowOptions = {
  chatId: unknown;
  onRated: () => void;
  socket: ChatRatingSocket | null;
};

export function useChatRatingFlow({
  chatId,
  onRated,
  socket,
}: UseChatRatingFlowOptions) {
  const [showRating, setShowRating] = useState(false);

  const openRating = useCallback(() => {
    setShowRating(true);
  }, []);

  const handleRate = useCallback((liked: boolean) => {
    if (!socket || !chatId) return;
    socket.emit('rate_partner', { chatId, rating: liked });
    onRated();
  }, [chatId, onRated, socket]);

  return {
    handleRate,
    openRating,
    showRating,
  };
}
