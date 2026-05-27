'use client';

import { useCallback, useState } from 'react';
import type { useAuth } from '@/context/AuthContext';
import type { useToast } from '@/context/ToastContext';
import { apiPost } from '@/utils/api';

type AuthState = ReturnType<typeof useAuth>;
type ToastState = ReturnType<typeof useToast>;

type UseChatComplaintFlowOptions = {
  activeDurationSeconds: number;
  chatId: unknown;
  clearActiveChat: () => void;
  navigateToHistory: () => void;
  refreshUser: AuthState['refreshUser'];
  t: (key: string) => string;
  toast: ToastState;
  updateUser: AuthState['updateUser'];
  user: AuthState['user'];
};

const getChatIdString = (chatId: unknown) => {
  if (!chatId) return null;
  return String(chatId);
};

export function useChatComplaintFlow({
  activeDurationSeconds,
  chatId,
  clearActiveChat,
  navigateToHistory,
  refreshUser,
  t,
  toast,
  updateUser,
  user,
}: UseChatComplaintFlowOptions) {
  const [showComplaint, setShowComplaint] = useState(false);

  const handleComplaint = useCallback(async () => {
    try {
      await refreshUser();
    } catch {
      // ignore
    }
    setShowComplaint(true);
  }, [refreshUser]);

  const handleCloseComplaint = useCallback(() => {
    setShowComplaint(false);
  }, []);

  const submitComplaint = useCallback(async (reason: string) => {
    const currentChatId = getChatIdString(chatId);
    if (!currentChatId) return;

    try {
      const reportedTotalDurationSeconds = Math.max(0, Math.floor(activeDurationSeconds));
      const data = await apiPost<{
        success: boolean;
        message: string;
        appealId: string;
        remainingChips: number;
      }>(`/chats/${currentChatId}/complaint`, { reason, reportedTotalDurationSeconds });

      if (user) {
        updateUser({ ...user, complaintChips: data.remainingChips } as Parameters<AuthState['updateUser']>[0]);
      }

      setShowComplaint(false);
      clearActiveChat();
      toast.success(t('chat.complaint_submitted'), `${t('chat.chips_left')} ${data.remainingChips}`);
      navigateToHistory();
    } catch (error: unknown) {
      console.error('Error submitting complaint:', error);
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('chat.complaint_submit_failed'));
      setShowComplaint(false);
    }
  }, [
    activeDurationSeconds,
    chatId,
    clearActiveChat,
    navigateToHistory,
    t,
    toast,
    updateUser,
    user,
  ]);

  return {
    handleCloseComplaint,
    handleComplaint,
    showComplaint,
    submitComplaint,
  };
}
