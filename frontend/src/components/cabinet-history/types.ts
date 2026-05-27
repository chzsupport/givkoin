export type ChatMessage = {
  sender: string;
  content: string;
  sentAt: string;
};

export type ChatHistoryEntry = {
  _id: string;
  participants: { _id: string; nickname?: string }[];
  startedAt?: string;
  status: string;
  relationship?: {
    isFriend: boolean;
    hasOutgoingFriendRequest: boolean;
    hasIncomingFriendRequest: boolean;
    canSendFriendRequest: boolean;
  } | null;
  complaint?: {
    from?: { _id: string; nickname?: string } | string;
    to?: { _id: string; nickname?: string } | string;
    reason?: string;
    createdAt?: string;
    autoResolveAt?: string;
    messagesSnapshot?: ChatMessage[];
    appealId?: { _id: string; status: string; appealedAt?: string; appealText?: string };
  };
};

export type BattleHistoryEntry = {
  battleId: string;
  endedAt?: string;
  lightDamage?: number;
  darknessDamage?: number;
  attendanceCount?: number;
  result?: 'light' | 'dark' | 'draw';
  userDamage?: number;
};

export type RadianceHistoryItem = {
  amount: number;
  activityType: string;
  occurredAt?: string;
  meta?: Record<string, unknown>;
};

export type EconomyHistoryItem = {
  _id: string;
  type: string;
  direction: 'credit' | 'debit';
  currency: 'K' | 'STAR';
  amount: number;
  description?: string;
  relatedEntity?: string;
  occurredAt?: string;
};

export type ChatHistoryResponse = {
  chats: ChatHistoryEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CabinetHistoryTab = 'battles' | 'chats' | 'radiance' | 'k' | 'stars';
