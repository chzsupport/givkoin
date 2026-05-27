'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useActiveChat } from '@/context/ActiveChatContext';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useToast } from '@/context/ToastContext';
import { useSocket } from '@/hooks/useSocket';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useChatHeartbeat } from './useChatHeartbeat';
import { useChatActiveDuration } from './useChatActiveDuration';
import { useChatComplaintFlow } from './useChatComplaintFlow';
import { useChatLeaveFlow } from './useChatLeaveFlow';
import { useChatMessageActions } from './useChatMessageActions';
import { useChatMessages } from './useChatMessages';
import { useChatPartnerDetails, type ChatPartnerWaitingDetails } from './useChatPartnerDetails';
import { useChatPartnerWaiting } from './useChatPartnerWaiting';
import { useChatRatingFlow } from './useChatRatingFlow';
import { useChatSocketEvents } from './useChatSocketEvents';
import { useChatViewportSize } from './useChatViewportSize';
import { useIncomingMessageSound } from './useIncomingMessageSound';

export function useChatPageRuntime() {
  const { chatId } = useParams();
  const router = useRouter();
  const { user, refreshUser, updateUser } = useAuth();
  const toast = useToast();
  const { clearActiveChat } = useActiveChat();
  const { localePath, t } = useI18n();
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [isConnecting, setIsConnecting] = useState(true);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const { windowHeight, windowWidth } = useChatViewportSize();
  const {
    clearPartnerWaiting,
    disconnectCount,
    isWaitingForPartner,
    maxDisconnects,
    startPartnerWaiting,
    waitingMessage,
    waitingTimeLeft,
  } = useChatPartnerWaiting();
  const lastLocalActivityAtRef = useRef<number>(Date.now());
  const chatHeartbeatSentAtRef = useRef<number>(0);
  const {
    activeDurationSeconds,
    activeDurationSecondsRef,
    freezeActiveDuration,
    resetPausedActiveDuration,
    setActiveDurationSeconds,
    setPausedActiveDuration,
  } = useChatActiveDuration(startedAt, isWaitingForPartner);

  const socket = useSocket(user?._id);
  const { playIncomingMessageSound } = useIncomingMessageSound();
  const { appendSocketMessage, fetchMessages, messages } = useChatMessages({
    chatId,
    playIncomingMessageSound,
    userId: user?._id,
  });
  const navigateToTree = useCallback(() => {
    clearActiveChat();
    setTimeout(() => {
      router.push(localePath('/tree'));
    }, 100);
  }, [clearActiveChat, router, localePath]);
  const {
    handleRate,
    openRating,
    showRating,
  } = useChatRatingFlow({
    chatId,
    onRated: navigateToTree,
    socket,
  });

  useEffect(() => {
    lastLocalActivityAtRef.current = Date.now();
    chatHeartbeatSentAtRef.current = 0;
    resetPausedActiveDuration();
  }, [chatId, resetPausedActiveDuration]);

  const touchChatActivity = useCallback(() => {
    lastLocalActivityAtRef.current = Date.now();
  }, []);

  useChatHeartbeat({
    socket,
    chatId,
    isEnabled: Boolean(user),
    isWaitingForPartner,
    activeDurationSecondsRef,
    lastLocalActivityAtRef,
    chatHeartbeatSentAtRef,
    touchChatActivity,
  });
  const {
    handleSendMessage,
    handleStopTyping,
    handleTyping,
  } = useChatMessageActions({
    chatId,
    onActivity: touchChatActivity,
    socket,
  });
  useChatSocketEvents({
    appendSocketMessage,
    chatId,
    clearActiveChat,
    clearPartnerWaiting,
    fetchMessages,
    freezeActiveDuration,
    localePath,
    openRating,
    resetPausedActiveDuration,
    router,
    setActiveDurationSeconds,
    setIsConnecting,
    setIsPartnerTyping,
    setStartedAt,
    socket,
    startPartnerWaiting,
    t,
    touchChatActivity,
    userId: user?._id,
  });

  const handlePartnerWaiting = useCallback((waitingSnapshot: ChatPartnerWaitingDetails) => {
    if (waitingSnapshot.activeSeconds != null) {
      setPausedActiveDuration(waitingSnapshot.activeSeconds);
    }
    startPartnerWaiting({
      disconnectCount: waitingSnapshot.disconnectCount,
      maxDisconnects: waitingSnapshot.maxDisconnects,
      message: t('chat.partner_connection_lost_wait'),
      timeLeft: waitingSnapshot.waitingTimeLeft,
    });
  }, [setPausedActiveDuration, startPartnerWaiting, t]);

  const handlePartnerNotWaiting = useCallback(() => {
    clearPartnerWaiting();
    resetPausedActiveDuration();
  }, [clearPartnerWaiting, resetPausedActiveDuration]);

  const {
    canSendFriendRequest,
    fetchChatDetails,
    handleAddFriend,
    isFriend,
    partnerName,
  } = useChatPartnerDetails({
    chatId,
    fallbackPartnerName: t('chat.partner_default_name'),
    onPartnerNotWaiting: handlePartnerNotWaiting,
    onPartnerWaiting: handlePartnerWaiting,
    onStartedAt: setStartedAt,
    t,
    toast,
    userId: user?._id,
  });

  const emitLeaveChat = useCallback((targetChatId: string, reportedTotalDurationSeconds: number) => {
    if (!socket) return;
    socket.emit('leave_chat', { chatId: targetChatId, reportedTotalDurationSeconds });
  }, [socket]);

  const {
    handleCancelLeave,
    handleCancelLeaveWaiting,
    handleConfirmLeave,
    handleConfirmLeaveWaiting,
    handleLeave,
    leaveConfirmIsEarly,
    showLeaveConfirm,
    showLeaveWarning,
  } = useChatLeaveFlow({
    activeDurationSeconds,
    chatId,
    isFriend,
    isLeaveAvailable: Boolean(socket && chatId),
    isWaitingForPartner,
    onLeaveChat: emitLeaveChat,
  });

  const navigateToHistory = useCallback(() => {
    router.push(localePath('/cabinet/history'));
  }, [router, localePath]);

  const {
    handleCloseComplaint,
    handleComplaint,
    showComplaint,
    submitComplaint,
  } = useChatComplaintFlow({
    activeDurationSeconds,
    chatId,
    clearActiveChat,
    navigateToHistory,
    refreshUser,
    t,
    toast,
    updateUser,
    user,
  });

  useEffect(() => {
    if (!socket) return;
    const handleFriendsUpdated = () => {
      fetchChatDetails();
    };
    socket.on('friends_updated', handleFriendsUpdated);
    return () => {
      socket.off('friends_updated', handleFriendsUpdated);
    };
  }, [socket, fetchChatDetails]);

  useEffect(() => {
    fetchChatDetails();
    fetchMessages();
  }, [fetchChatDetails, fetchMessages]);

  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
  const isDesktop = Boolean(sideAdSlot);
  const isSmallHeight = windowHeight < 700;

  return {
    activeDurationSeconds,
    canSendFriendRequest,
    disconnectCount,
    handleAddFriend,
    handleCancelLeave,
    handleCancelLeaveWaiting,
    handleComplaint,
    handleConfirmLeave,
    handleConfirmLeaveWaiting,
    handleLeave,
    handleRate,
    handleSendMessage,
    handleStopTyping,
    handleTyping,
    isConnecting,
    isDesktop,
    isPartnerTyping,
    isSmallHeight,
    isWaitingForPartner,
    maxDisconnects,
    messages,
    partnerName,
    handleCloseComplaint,
    showComplaint,
    showLeaveConfirm,
    showLeaveWarning,
    showRating,
    sideAdSlot,
    startedAt,
    submitComplaint,
    t,
    user,
    waitingMessage,
    waitingTimeLeft,
    leaveConfirmIsEarly,
  };
}
