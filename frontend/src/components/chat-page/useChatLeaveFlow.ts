'use client';

import { useCallback, useState } from 'react';

type UseChatLeaveFlowOptions = {
  activeDurationSeconds: number;
  chatId: unknown;
  isFriend: boolean;
  isLeaveAvailable: boolean;
  isWaitingForPartner: boolean;
  onLeaveChat: (chatId: string, reportedTotalDurationSeconds: number) => void;
};

const getChatIdString = (chatId: unknown) => {
  if (!chatId) return null;
  return String(chatId);
};

export function useChatLeaveFlow({
  activeDurationSeconds,
  chatId,
  isFriend,
  isLeaveAvailable,
  isWaitingForPartner,
  onLeaveChat,
}: UseChatLeaveFlowOptions) {
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [leaveWarningChatId, setLeaveWarningChatId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveConfirmChatId, setLeaveConfirmChatId] = useState<string | null>(null);
  const [leaveConfirmIsEarly, setLeaveConfirmIsEarly] = useState(false);

  const getReportedDuration = useCallback(() => {
    return Math.max(0, Math.floor(activeDurationSeconds));
  }, [activeDurationSeconds]);

  const handleLeave = useCallback(() => {
    const currentChatId = getChatIdString(chatId);
    if (!isLeaveAvailable || !currentChatId) return;

    if (isFriend) {
      onLeaveChat(currentChatId, getReportedDuration());
      return;
    }

    if (isWaitingForPartner) {
      setShowLeaveWarning(true);
      setLeaveWarningChatId(currentChatId);
      return;
    }

    setLeaveConfirmIsEarly(activeDurationSeconds < 300);
    setLeaveConfirmChatId(currentChatId);
    setShowLeaveConfirm(true);
  }, [
    activeDurationSeconds,
    chatId,
    getReportedDuration,
    isFriend,
    isLeaveAvailable,
    isWaitingForPartner,
    onLeaveChat,
  ]);

  const handleConfirmLeaveWaiting = useCallback(() => {
    if (!isLeaveAvailable || !leaveWarningChatId) return;
    onLeaveChat(leaveWarningChatId, getReportedDuration());
    setShowLeaveWarning(false);
    setLeaveWarningChatId(null);
  }, [getReportedDuration, isLeaveAvailable, leaveWarningChatId, onLeaveChat]);

  const handleCancelLeaveWaiting = useCallback(() => {
    setShowLeaveWarning(false);
    setLeaveWarningChatId(null);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    if (!isLeaveAvailable || !leaveConfirmChatId) return;
    onLeaveChat(leaveConfirmChatId, getReportedDuration());
    setShowLeaveConfirm(false);
    setLeaveConfirmChatId(null);
  }, [getReportedDuration, isLeaveAvailable, leaveConfirmChatId, onLeaveChat]);

  const handleCancelLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    setLeaveConfirmChatId(null);
  }, []);

  return {
    handleCancelLeave,
    handleCancelLeaveWaiting,
    handleConfirmLeave,
    handleConfirmLeaveWaiting,
    handleLeave,
    leaveConfirmIsEarly,
    showLeaveConfirm,
    showLeaveWarning,
  };
}
