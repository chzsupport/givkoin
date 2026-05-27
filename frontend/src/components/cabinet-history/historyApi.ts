import { apiGet } from '@/utils/api';
import type { BattleSummaryPayload } from '@/lib/battleSummary';
import type {
  BattleHistoryEntry,
  ChatHistoryResponse,
  ChatMessage,
  EconomyHistoryItem,
  RadianceHistoryItem,
} from './types';

export async function fetchChatHistoryPage({
  limit,
  offset,
}: {
  limit: number;
  offset: number;
}) {
  const data = await apiGet<ChatHistoryResponse>(`/chats/history?limit=${limit}&offset=${offset}`);
  return {
    chats: Array.isArray(data?.chats) ? data.chats : [],
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchBattleHistory() {
  const data = await apiGet<{ battles: BattleHistoryEntry[] }>('/battles/history');
  return data?.battles || [];
}

export async function fetchRadianceHistoryPage({
  limit,
  offset,
}: {
  limit: number;
  offset: number;
}) {
  const historyRes = await apiGet<{ items: RadianceHistoryItem[] }>(
    `/radiance/history?limit=${limit}&offset=${offset}`,
  );
  return historyRes?.items || [];
}

export async function fetchRadianceTotal() {
  const totalRes = await apiGet<{ total: number }>('/radiance/total-earned');
  return Number(totalRes?.total) || 0;
}

export async function fetchEconomyHistoryPage({
  currency,
  limit,
  offset,
}: {
  currency: 'K' | 'STAR';
  limit: number;
  offset: number;
}) {
  const historyRes = await apiGet<{ items: EconomyHistoryItem[] }>(
    `/economy/history?currency=${currency}&direction=credit&limit=${limit}&offset=${offset}`,
  );
  return historyRes?.items || [];
}

export async function fetchEconomyTotal(currency: 'K' | 'STAR') {
  const totalRes = await apiGet<{ total: number }>(`/economy/total-earned?currency=${currency}&direction=credit`);
  return Number(totalRes?.total) || 0;
}

export async function fetchChatMessages(chatId: string): Promise<ChatMessage[]> {
  const rawMessages = await apiGet<unknown>(`/chats/${chatId}/messages`);
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages.map((message) => {
    const row = typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : {};
    const sender = row.senderId ?? row.sender ?? 'unknown';
    const content = row.originalText ?? row.content ?? '';
    const sentAt = row.createdAt ?? row.sentAt ?? new Date().toISOString();
    return {
      sender: String(sender),
      content: String(content),
      sentAt: String(sentAt),
    };
  });
}

export function fetchBattleSummary(battleId: string) {
  return apiGet<BattleSummaryPayload>(`/battles/summary?battleId=${battleId}`);
}
