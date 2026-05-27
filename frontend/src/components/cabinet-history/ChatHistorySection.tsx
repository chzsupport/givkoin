'use client';

import { AlertTriangle, Eye, Trash2, UserPlus } from 'lucide-react';
import { getAppealStatusLabel, getComplaintReasonLabel } from '@/lib/chatComplaint';
import { formatDateTime } from '@/utils/formatters';
import type { ChatHistoryEntry } from './types';

type ChatHistorySectionProps = {
  chats: ChatHistoryEntry[];
  loadingChats: boolean;
  chatError: string;
  chatHasMore: boolean;
  loadingMoreChats: boolean;
  currentUserId?: string;
  language: string;
  t: (key: string) => string;
  onViewChat: (chat: ChatHistoryEntry) => void;
  onAddFriend: (partnerId: string, partnerName: string) => void;
  onDispute: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onLoadMore: () => void;
};

const getId = (obj: { _id: string } | string | undefined): string => {
  if (!obj) return '';
  return typeof obj === 'string' ? obj : obj._id;
};

export function ChatHistorySection({
  chats,
  loadingChats,
  chatError,
  chatHasMore,
  loadingMoreChats,
  currentUserId,
  language,
  t,
  onViewChat,
  onAddFriend,
  onDispute,
  onDeleteChat,
  onLoadMore,
}: ChatHistorySectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-h3">{t('history.chat_history')}</h2>
          <p className="text-secondary text-white/70">{t('history.complaints_visible')}</p>
          <p className="mt-1 text-tiny text-white/50">{t('history.chat_retention_notice')}</p>
        </div>
        {loadingChats && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
      </div>
      {chatError && <div className="mt-3 text-secondary text-rose-300">{chatError}</div>}
      <div className="mt-4 space-y-3">
        {chats.map((chat) => {
          const complaint = chat.complaint;
          const complaintToId = getId(complaint?.to);
          const youAreAccused = Boolean(complaintToId && currentUserId && complaintToId === currentUserId);
          const canDispute =
            youAreAccused &&
            !!complaint?.appealId &&
            !complaint.appealId.appealedAt &&
            !!complaint?.autoResolveAt &&
            new Date(complaint.autoResolveAt).getTime() > Date.now();
          const canViewTranscript = Boolean(complaint || chat.relationship?.isFriend);
          const partner = chat.participants.find((participant) => participant._id !== currentUserId);

          return (
            <div key={chat._id} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                <span className="font-semibold text-white">
                  {partner?.nickname || t('history.anonymous')}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-tiny uppercase">
                  {chat.status === 'complained' ? t('history.complaint') : chat.status === 'ended' ? t('history.ended') : t('history.active')}
                </span>
                {complaint?.reason && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-tiny text-amber-200">
                    {t('chat.reason')} {getComplaintReasonLabel(t, complaint.reason)}
                  </span>
                )}
                {complaint?.createdAt && (
                  <span className="text-tiny text-white/60">
                    {formatDateTime(complaint.createdAt, language)}
                  </span>
                )}
                {complaint?.appealId && (
                  <span className="rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-tiny text-blue-200">
                    {t('chat.disputed')} {getAppealStatusLabel(t, complaint.appealId.status)}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {canViewTranscript && (
                  <button
                    onClick={() => onViewChat(chat)}
                    className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-tiny text-white hover:border-white/40 transition"
                  >
                    <Eye size={14} />
                    {t('history.view')}
                  </button>
                )}

                {partner && chat.relationship?.canSendFriendRequest && (
                  <button
                    onClick={() => onAddFriend(partner._id, partner.nickname || t('chat.partner'))}
                    className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-tiny text-emerald-200 hover:border-emerald-400/50 transition"
                  >
                    <UserPlus size={14} />
                    {t('chat.add_friend')}
                  </button>
                )}

                {canDispute && (
                  <button
                    onClick={() => onDispute(chat._id)}
                    className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-tiny text-amber-200 hover:border-amber-400/50 transition"
                  >
                    <AlertTriangle size={14} />
                    {t('chat.resolve')}
                  </button>
                )}

                <button
                  onClick={() => onDeleteChat(chat._id)}
                  className="flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-tiny text-rose-200 hover:border-rose-400/50 transition"
                >
                  <Trash2 size={14} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          );
        })}
        {chats.length === 0 && !loadingChats && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
            {t('history.chat_history_empty')}
          </div>
        )}
        {chatHasMore && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMoreChats}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:opacity-50"
            >
              {loadingMoreChats ? t('common.loading') : t('history.show_more')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
