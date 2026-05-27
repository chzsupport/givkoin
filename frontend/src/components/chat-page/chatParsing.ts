import type { ChatMessage, ChatParticipant, Relationship } from './types';

type ChatDetailsPayload = {
  participants: unknown[];
  startedAt: Date | null;
  waitingState: Record<string, unknown> | null;
  disconnectionCount: Record<string, unknown>;
  relationship: Relationship | null;
};

type ChatWaitingSnapshot =
  | {
    status: 'partner_waiting';
    activeSeconds: number | null;
    waitingTimeLeft: number;
    disconnectCount: number;
    maxDisconnects: number;
  }
  | { status: 'not_waiting' }
  | { status: 'unchanged' };

export function isLikelyEmail(value: string) {
  const candidate = String(value || '').trim();
  if (!candidate) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
}

export function extractParticipant(raw: unknown): ChatParticipant | null {
  const row = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!row) return null;

  const rawId = row._id;
  const rawUser = typeof row.user === 'object' && row.user !== null
    ? (row.user as Record<string, unknown>)
    : null;
  const id =
    (typeof rawId === 'string' && rawId) ||
    (typeof rawUser?._id === 'string' && rawUser._id) ||
    '';
  if (!id) return null;

  const nicknameCandidate =
    (typeof row.nickname === 'string' && row.nickname.trim()) ||
    (typeof rawUser?.nickname === 'string' && rawUser.nickname.trim()) ||
    '';
  const nickname = nicknameCandidate && !isLikelyEmail(nicknameCandidate) ? nicknameCandidate : '';

  return { id, nickname };
}

export function findChatPartner(participants: unknown[], currentUserId: string) {
  return participants
    .map((participant) => extractParticipant(participant))
    .find((participant) => participant && participant.id !== currentUserId) || null;
}

export function readSocketDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function readActiveElapsedSeconds(value: unknown): number | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds);
}

function createFallbackMessageId() {
  return Math.random().toString(36).slice(2);
}

export function readChatMessage(
  source: unknown,
  currentUserId: string,
  fallbackStatus: ChatMessage['status'] = 'sent'
): ChatMessage {
  const row = typeof source === 'object' && source !== null ? (source as Record<string, unknown>) : {};
  const status = row.status === 'delivered' || row.status === 'read' || row.status === 'sent'
    ? row.status
    : fallbackStatus;

  return {
    _id: typeof row._id === 'string' ? row._id : createFallbackMessageId(),
    text: typeof row.originalText === 'string' ? row.originalText : '',
    translatedText: typeof row.translatedText === 'string' ? row.translatedText : undefined,
    isMine: row.senderId === currentUserId,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    status,
  };
}

export function readChatMessages(source: unknown, currentUserId: string): ChatMessage[] {
  if (!Array.isArray(source)) return [];
  return source.map((item) => readChatMessage(item, currentUserId));
}

export function getChatMessageIdSet(messages: ChatMessage[]) {
  return new Set<string>(messages.map((message) => message._id));
}

export function hasNewIncomingChatMessage(
  messages: ChatMessage[],
  knownMessageIds: Set<string>,
  hasBaseline: boolean
) {
  return hasBaseline && messages.some((message) => !message.isMine && !knownMessageIds.has(message._id));
}

export function readRelationship(source: unknown): Relationship | null {
  if (!source || typeof source !== 'object') return null;
  const rel = source as Partial<Relationship>;
  return {
    isFriend: Boolean(rel.isFriend),
    hasOutgoingFriendRequest: Boolean(rel.hasOutgoingFriendRequest),
    hasIncomingFriendRequest: Boolean(rel.hasIncomingFriendRequest),
    canSendFriendRequest: Boolean(rel.canSendFriendRequest),
  };
}

export function markOutgoingFriendRequest(relationship: Relationship | null): Relationship {
  return {
    ...(relationship || {
      isFriend: false,
      hasOutgoingFriendRequest: false,
      hasIncomingFriendRequest: false,
      canSendFriendRequest: false,
    }),
    isFriend: false,
    hasOutgoingFriendRequest: true,
    hasIncomingFriendRequest: false,
    canSendFriendRequest: false,
  };
}

export function readChatDetailsPayload(source: unknown): ChatDetailsPayload | null {
  if (typeof source !== 'object' || source === null || !('participants' in source)) return null;
  const row = source as {
    participants?: unknown;
    startedAt?: unknown;
    waitingState?: unknown;
    disconnectionCount?: unknown;
    relationship?: unknown;
  };
  const disconnectionCount = typeof row.disconnectionCount === 'object' && row.disconnectionCount !== null
    ? row.disconnectionCount as Record<string, unknown>
    : {};

  return {
    participants: Array.isArray(row.participants) ? row.participants : [],
    startedAt: readSocketDate(row.startedAt),
    waitingState: typeof row.waitingState === 'object' && row.waitingState !== null
      ? row.waitingState as Record<string, unknown>
      : null,
    disconnectionCount,
    relationship: readRelationship(row.relationship),
  };
}

export function readChatWaitingSnapshot({
  waitingState,
  disconnectionCount,
  currentUserId,
  startedAt,
  nowMs = Date.now(),
}: {
  waitingState: Record<string, unknown> | null;
  disconnectionCount: Record<string, unknown>;
  currentUserId: string;
  startedAt: Date;
  nowMs?: number;
}): ChatWaitingSnapshot {
  const disconnectedId = String(waitingState?.disconnectedUserId || '');
  if (waitingState?.isWaiting === true && disconnectedId && disconnectedId !== currentUserId) {
    const waitingSince = readSocketDate(waitingState.waitingSince);
    const activeSeconds = readActiveElapsedSeconds(waitingState.activeElapsedSeconds)
      ?? (waitingSince ? Math.max(0, Math.floor((waitingSince.getTime() - startedAt.getTime()) / 1000)) : null);
    const waitingElapsed = waitingSince ? Math.max(0, Math.floor((nowMs - waitingSince.getTime()) / 1000)) : 0;

    return {
      status: 'partner_waiting',
      activeSeconds,
      waitingTimeLeft: Math.max(0, 60 - waitingElapsed),
      disconnectCount: Math.max(0, Number(disconnectionCount[disconnectedId]) || 0),
      maxDisconnects: 3,
    };
  }

  if (waitingState?.isWaiting !== true) {
    return { status: 'not_waiting' };
  }

  return { status: 'unchanged' };
}
