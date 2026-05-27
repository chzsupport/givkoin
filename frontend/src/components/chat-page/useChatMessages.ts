'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/utils/api';
import {
  getChatMessageIdSet,
  hasNewIncomingChatMessage,
  readChatMessage,
  readChatMessages,
} from './chatParsing';
import type { ChatMessage } from './types';

type UseChatMessagesOptions = {
  chatId: unknown;
  playIncomingMessageSound: () => void;
  userId?: string;
};

const getChatIdString = (chatId: unknown) => {
  if (!chatId) return null;
  return String(chatId);
};

export function useChatMessages({
  chatId,
  playIncomingMessageSound,
  userId,
}: UseChatMessagesOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const hasMessagesBaselineRef = useRef(false);

  useEffect(() => {
    knownMessageIdsRef.current = new Set();
    hasMessagesBaselineRef.current = false;
    setMessages([]);
  }, [chatId]);

  const fetchMessages = useCallback(async () => {
    const currentChatId = getChatIdString(chatId);
    if (!currentChatId || !userId) return;

    try {
      const messagesData = await apiGet<unknown>(`/chats/${currentChatId}/messages`);
      if (!Array.isArray(messagesData)) return;
      const mapped = readChatMessages(messagesData, userId);

      const hasBaseline = hasMessagesBaselineRef.current;
      const prevIds = knownMessageIdsRef.current;
      const nextIds = getChatMessageIdSet(mapped);
      const hasNewIncoming = hasNewIncomingChatMessage(mapped, prevIds, hasBaseline);

      knownMessageIdsRef.current = nextIds;
      hasMessagesBaselineRef.current = true;
      setMessages(mapped);

      if (hasNewIncoming) {
        playIncomingMessageSound();
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [chatId, playIncomingMessageSound, userId]);

  const appendSocketMessage = useCallback((source: unknown) => {
    if (!userId) return null;
    const nextMessage = readChatMessage(source, userId);

    setMessages((prev) => {
      if (prev.some((existing) => existing._id === nextMessage._id)) return prev;
      return [...prev, nextMessage];
    });

    knownMessageIdsRef.current.add(nextMessage._id);
    hasMessagesBaselineRef.current = true;
    if (!nextMessage.isMine) {
      playIncomingMessageSound();
    }

    return nextMessage;
  }, [playIncomingMessageSound, userId]);

  return {
    appendSocketMessage,
    fetchMessages,
    messages,
  };
}
