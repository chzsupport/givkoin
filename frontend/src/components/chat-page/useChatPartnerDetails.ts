'use client';

import { useCallback, useEffect, useState } from 'react';
import type { useToast } from '@/context/ToastContext';
import { apiGet, apiPost } from '@/utils/api';
import {
  findChatPartner,
  markOutgoingFriendRequest,
  readChatDetailsPayload,
  readChatWaitingSnapshot,
} from './chatParsing';
import type { Relationship } from './types';

type ToastState = ReturnType<typeof useToast>;

export type ChatPartnerWaitingDetails = {
  activeSeconds: number | null;
  disconnectCount: number;
  maxDisconnects: number;
  waitingTimeLeft: number;
};

type UseChatPartnerDetailsOptions = {
  chatId: unknown;
  fallbackPartnerName: string;
  onPartnerNotWaiting: () => void;
  onPartnerWaiting: (snapshot: ChatPartnerWaitingDetails) => void;
  onStartedAt: (startedAt: Date) => void;
  t: (key: string) => string;
  toast: ToastState;
  userId?: string;
};

const getChatIdString = (chatId: unknown) => {
  if (!chatId) return null;
  return String(chatId);
};

export function useChatPartnerDetails({
  chatId,
  fallbackPartnerName,
  onPartnerNotWaiting,
  onPartnerWaiting,
  onStartedAt,
  t,
  toast,
  userId,
}: UseChatPartnerDetailsOptions) {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>(fallbackPartnerName);
  const [relationship, setRelationship] = useState<Relationship | null>(null);

  useEffect(() => {
    setPartnerId(null);
    setPartnerName(fallbackPartnerName);
    setRelationship(null);
  }, [chatId, fallbackPartnerName]);

  const fetchChatDetails = useCallback(async () => {
    const currentChatId = getChatIdString(chatId);
    if (!currentChatId || !userId) return;

    try {
      const chat = await apiGet<unknown>(`/chats/${currentChatId}`);
      const details = readChatDetailsPayload(chat);
      if (!details) return;

      const partner = findChatPartner(details.participants, userId);
      if (partner) {
        setPartnerId(partner.id);
        setPartnerName(partner.nickname || fallbackPartnerName);
      }

      const nextStartedAt = details.startedAt || new Date();
      if (details.startedAt) {
        onStartedAt(details.startedAt);
      }

      const waitingSnapshot = readChatWaitingSnapshot({
        waitingState: details.waitingState,
        disconnectionCount: details.disconnectionCount,
        currentUserId: userId,
        startedAt: nextStartedAt,
      });
      if (waitingSnapshot.status === 'partner_waiting') {
        onPartnerWaiting({
          activeSeconds: waitingSnapshot.activeSeconds,
          disconnectCount: waitingSnapshot.disconnectCount,
          maxDisconnects: waitingSnapshot.maxDisconnects,
          waitingTimeLeft: waitingSnapshot.waitingTimeLeft,
        });
      } else if (waitingSnapshot.status === 'not_waiting') {
        onPartnerNotWaiting();
      }

      setRelationship(details.relationship);
    } catch (error) {
      console.error('Error fetching chat details:', error);
    }
  }, [
    chatId,
    fallbackPartnerName,
    onPartnerNotWaiting,
    onPartnerWaiting,
    onStartedAt,
    userId,
  ]);

  const handleAddFriend = useCallback(async () => {
    if (!partnerId) return;

    try {
      const data = await apiPost<{ status?: string; message?: string }>('/match/friends/request', { friendId: partnerId });
      setRelationship(markOutgoingFriendRequest);
      toast.success(
        data?.status === 'pending_acceptance' ? t('chat.friend_request_pending') : t('chat.friend_request_sent'),
        data?.status === 'pending_acceptance' ? t('chat.friend_request_pending_hint') : t('chat.friend_request_wait_confirm'),
      );
      fetchChatDetails();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      const alreadySentNeedle = t('gen.s227');
      if (alreadySentNeedle && message.toLowerCase().includes(alreadySentNeedle.toLowerCase())) {
        setRelationship(markOutgoingFriendRequest);
      }
      toast.error(t('common.error'), message || t('chat.friend_request_send_error'));
    }
  }, [fetchChatDetails, partnerId, t, toast]);

  return {
    canSendFriendRequest: Boolean(relationship?.canSendFriendRequest),
    fetchChatDetails,
    handleAddFriend,
    isFriend: Boolean(relationship?.isFriend),
    partnerName,
  };
}
