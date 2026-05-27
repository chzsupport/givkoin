'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { parseBattleSummaryPayload, type BattleSummary } from '@/lib/battleSummary';
import { useI18n } from '@/context/I18nContext';
import { CabinetHistoryContent } from '@/components/cabinet-history/CabinetHistoryContent';
import { CabinetHistoryDialogs } from '@/components/cabinet-history/CabinetHistoryDialogs';
import { CabinetHistoryScrollbarStyle } from '@/components/cabinet-history/CabinetHistoryScrollbarStyle';
import { CHAT_INITIAL_LIMIT, CHAT_MORE_LIMIT, HISTORY_PAGE_LIMIT } from '@/components/cabinet-history/constants';
import {
  fetchBattleHistory,
  fetchBattleSummary,
  fetchChatHistoryPage,
  fetchChatMessages,
  fetchEconomyHistoryPage,
  fetchEconomyTotal,
  fetchRadianceHistoryPage,
  fetchRadianceTotal,
} from '@/components/cabinet-history/historyApi';
import { createCabinetHistoryLabels } from '@/components/cabinet-history/historyLabels';
import type {
  BattleHistoryEntry,
  CabinetHistoryTab,
  ChatHistoryEntry,
  ChatMessage,
  EconomyHistoryItem,
  RadianceHistoryItem,
} from '@/components/cabinet-history/types';

export default function CabinetHistoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { language, t } = useI18n();
  const [chats, setChats] = useState<ChatHistoryEntry[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatHasMore, setChatHasMore] = useState(false);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showChatView, setShowChatView] = useState(false);
  const [viewMessages, setViewMessages] = useState<ChatMessage[]>([]);
  const [viewPartnerName, setViewPartnerName] = useState('');
  const [battleHistory, setBattleHistory] = useState<BattleHistoryEntry[]>([]);
  const [loadingBattles, setLoadingBattles] = useState(false);
  const [radianceHistory, setRadianceHistory] = useState<RadianceHistoryItem[]>([]);
  const [radianceTotal, setRadianceTotal] = useState<number>(0);
  const [radianceHasMore, setRadianceHasMore] = useState(false);
  const [kHistory, setKHistory] = useState<EconomyHistoryItem[]>([]);
  const [kTotal, setKTotal] = useState<number>(0);
  const [kHasMore, setKHasMore] = useState(false);
  const [starsHistory, setStarsHistory] = useState<EconomyHistoryItem[]>([]);
  const [starsTotal, setStarsTotal] = useState<number>(0);
  const [starsHasMore, setStarsHasMore] = useState(false);

  const {
    getEconomyEntryName,
    getRadianceActivityName,
    getTreeHealConversionText,
  } = createCabinetHistoryLabels(t, language);

  const loadChatHistoryPage = async ({
    offset = 0,
    limit = CHAT_INITIAL_LIMIT,
    append = false,
  }: {
    offset?: number;
    limit?: number;
    append?: boolean;
  } = {}) => {
    const data = await fetchChatHistoryPage({ limit, offset });
    const nextChats = data.chats;
    setChats((prev) => append ? [...prev, ...nextChats] : nextChats);
    setChatHasMore(data.hasMore);
  };

  const loadMoreChats = async () => {
    if (loadingMoreChats || loadingChats || !chatHasMore) return;
    setLoadingMoreChats(true);
    try {
      await loadChatHistoryPage({ offset: chats.length, limit: CHAT_MORE_LIMIT, append: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('history.chat_load_error'));
    } finally {
      setLoadingMoreChats(false);
    }
  };

  const loadMoreRadiance = async () => {
    if (loadingRadiance || !radianceHasMore) return;
    setLoadingRadiance(true);
    try {
      const nextItems = await fetchRadianceHistoryPage({
        limit: HISTORY_PAGE_LIMIT,
        offset: radianceHistory.length,
      });
      setRadianceHistory((prev) => [...prev, ...nextItems]);
      setRadianceHasMore(nextItems.length >= HISTORY_PAGE_LIMIT);
    } finally {
      setLoadingRadiance(false);
    }
  };

  const loadMoreK = async () => {
    if (loadingK || !kHasMore) return;
    setLoadingK(true);
    try {
      const nextItems = await fetchEconomyHistoryPage({
        currency: 'K',
        limit: HISTORY_PAGE_LIMIT,
        offset: kHistory.length,
      });
      setKHistory((prev) => [...prev, ...nextItems]);
      setKHasMore(nextItems.length >= HISTORY_PAGE_LIMIT);
    } finally {
      setLoadingK(false);
    }
  };

  const loadMoreStars = async () => {
    if (loadingStars || !starsHasMore) return;
    setLoadingStars(true);
    try {
      const nextItems = await fetchEconomyHistoryPage({
        currency: 'STAR',
        limit: HISTORY_PAGE_LIMIT,
        offset: starsHistory.length,
      });
      setStarsHistory((prev) => [...prev, ...nextItems]);
      setStarsHasMore(nextItems.length >= HISTORY_PAGE_LIMIT);
    } finally {
      setLoadingStars(false);
    }
  };
  const [loadingRadiance, setLoadingRadiance] = useState(false);
  const [loadingK, setLoadingK] = useState(false);
  const [loadingStars, setLoadingStars] = useState(false);
  const [battleSummary, setBattleSummary] = useState<BattleSummary | null>(null);
  const [summaryBattleId, setSummaryBattleId] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<CabinetHistoryTab>('battles');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) return;
      setLoadingChats(true);
      setChatError('');
      try {
        await loadChatHistoryPage({ offset: 0, limit: CHAT_INITIAL_LIMIT });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '';
        if (!cancelled) setChatError(message || t('history.chat_load_error'));
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user, t]);

  useEffect(() => {
    let cancelled = false;
    const loadBattles = async () => {
      if (!user) return;
      setLoadingBattles(true);
      try {
        const data = await fetchBattleHistory();
        if (!cancelled) setBattleHistory(data);
      } catch (e: unknown) {
        if (!cancelled) setBattleHistory([]);
      } finally {
        if (!cancelled) setLoadingBattles(false);
      }
    };
    loadBattles();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const loadRadiance = async () => {
      if (!user) return;
      setLoadingRadiance(true);
      try {
        const [nextItems, total] = await Promise.all([
          fetchRadianceHistoryPage({ limit: HISTORY_PAGE_LIMIT, offset: 0 }),
          fetchRadianceTotal(),
        ]);
        if (!cancelled) {
          setRadianceHistory(nextItems);
          setRadianceHasMore(nextItems.length >= HISTORY_PAGE_LIMIT);
          setRadianceTotal(total);
        }
      } catch {
        if (!cancelled) {
          setRadianceHistory([]);
          setRadianceHasMore(false);
          setRadianceTotal(0);
        }
      } finally {
        if (!cancelled) setLoadingRadiance(false);
      }
    };
    loadRadiance();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const loadK = async () => {
      if (!user) return;
      setLoadingK(true);
      try {
        const [nextItems, total] = await Promise.all([
          fetchEconomyHistoryPage({ currency: 'K', limit: HISTORY_PAGE_LIMIT, offset: 0 }),
          fetchEconomyTotal('K'),
        ]);
        if (!cancelled) {
          setKHistory(nextItems);
          setKHasMore(nextItems.length >= HISTORY_PAGE_LIMIT);
          setKTotal(total);
        }
      } catch {
        if (!cancelled) {
          setKHistory([]);
          setKHasMore(false);
          setKTotal(0);
        }
      } finally {
        if (!cancelled) setLoadingK(false);
      }
    };
    loadK();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const loadStars = async () => {
      if (!user) return;
      setLoadingStars(true);
      try {
        const [nextItems, total] = await Promise.all([
          fetchEconomyHistoryPage({ currency: 'STAR', limit: HISTORY_PAGE_LIMIT, offset: 0 }),
          fetchEconomyTotal('STAR'),
        ]);
        if (!cancelled) {
          setStarsHistory(nextItems);
          setStarsHasMore(nextItems.length >= HISTORY_PAGE_LIMIT);
          setStarsTotal(total);
        }
      } catch {
        if (!cancelled) {
          setStarsHistory([]);
          setStarsHasMore(false);
          setStarsTotal(0);
        }
      } finally {
        if (!cancelled) setLoadingStars(false);
      }
    };
    loadStars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleDisputeClick = (chatId: string) => {
    setSelectedChatId(chatId);
    setShowDispute(true);
  };

  const submitDispute = async (text: string) => {
    if (!selectedChatId) return;

    try {
      await apiPost(`/appeals/${selectedChatId}/appeal-text`, { appealText: text });
      await loadChatHistoryPage({ offset: 0, limit: CHAT_INITIAL_LIMIT });
      setShowDispute(false);
      setSelectedChatId(null);
      toast.success(t('common.sent'), t('chat.appeal_submitted'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('chat.appeal_failed'));
      throw e;
    }
  };

  const handleViewChat = async (chat: ChatHistoryEntry) => {
    // Получаем сообщения из complaint.messagesSnapshot или загружаем с сервера
    const partner = chat.participants.find(p => p._id !== user?._id);
    setViewPartnerName(partner?.nickname || t('chat.partner'));

    if (chat.complaint?.messagesSnapshot && chat.complaint.messagesSnapshot.length > 0) {
      setViewMessages(chat.complaint.messagesSnapshot);
    } else {
      // Загружаем сообщения с сервера
      try {
        setViewMessages(await fetchChatMessages(chat._id));
      } catch (e) {
        setViewMessages([]);
      }
    }
    setShowChatView(true);
  };

  const handleViewBattleSummary = async (battleId: string) => {
    setSummaryLoading(true);
    setSummaryBattleId(battleId);
    try {
      const data = await fetchBattleSummary(battleId);
      setBattleSummary((previous) => parseBattleSummaryPayload(data, previous, language));
      setSummaryVisible(true);
    } catch (e: unknown) {
      setBattleSummary(null);
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('history.battle_summary_error'));
    } finally {
      setSummaryLoading(false);
    }
  };

  const closeSummary = () => {
    setSummaryVisible(false);
    setBattleSummary(null);
    setSummaryBattleId(null);
  };

  useEffect(() => {
    if (!summaryVisible || !summaryBattleId || !battleSummary?.detailsPending) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchBattleSummary(summaryBattleId);
        setBattleSummary((previous) => parseBattleSummaryPayload(data, previous, language));
      } catch (_error) {
        // Оставляем последний удачный итог и тихо пробуем снова следующим кругом.
      }
    }, Math.max(2000, battleSummary.detailsRetryAfterMs || 3000));

    return () => {
      window.clearTimeout(timer);
    };
  }, [battleSummary, language, summaryBattleId, summaryVisible]);

  const handleAddFriend = async (partnerId: string, partnerName: string) => {
    try {
      const response = await apiPost<{ status?: string }>('/match/friends/request', { friendId: partnerId });
      toast.success(
        response?.status === 'pending_acceptance' ? t('history.request_pending') : t('history.request_sent'),
        response?.status === 'pending_acceptance'
          ? t('history.accept_in_cabinet')
          : partnerName
      );
      setChats((prev) =>
        prev.map((chat) => {
          const hasPartner = Array.isArray(chat.participants)
            && chat.participants.some((p) => p._id === partnerId);
          if (!hasPartner) return chat;
          return {
            ...chat,
            relationship: {
              isFriend: false,
              hasOutgoingFriendRequest: true,
              hasIncomingFriendRequest: false,
              canSendFriendRequest: false,
            },
          };
        })
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('history.friend_request_error'));
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!confirm(t('history.confirm_delete_chat'))) return;

    try {
      await apiPost(`/chats/${chatId}/delete`, {});
      setChats(chats.filter(c => c._id !== chatId));
      toast.success(t('common.done'), t('history.chat_deleted'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('history.chat_delete_error'));
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CabinetHistoryContent
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        battleHistory={battleHistory}
        loadingBattles={loadingBattles}
        chats={chats}
        loadingChats={loadingChats}
        chatError={chatError}
        chatHasMore={chatHasMore}
        loadingMoreChats={loadingMoreChats}
        currentUserId={user?._id}
        radianceHistory={radianceHistory}
        radianceTotal={radianceTotal}
        loadingRadiance={loadingRadiance}
        radianceHasMore={radianceHasMore}
        kHistory={kHistory}
        kTotal={kTotal}
        loadingK={loadingK}
        kHasMore={kHasMore}
        starsHistory={starsHistory}
        starsTotal={starsTotal}
        loadingStars={loadingStars}
        starsHasMore={starsHasMore}
        language={language}
        t={t}
        getEconomyEntryName={getEconomyEntryName}
        getRadianceActivityName={getRadianceActivityName}
        getTreeHealConversionText={getTreeHealConversionText}
        onViewBattleSummary={handleViewBattleSummary}
        onViewChat={handleViewChat}
        onAddFriend={handleAddFriend}
        onDispute={handleDisputeClick}
        onDeleteChat={handleDeleteChat}
        onLoadMoreChats={() => void loadMoreChats()}
        onLoadMoreRadiance={() => void loadMoreRadiance()}
        onLoadMoreK={() => void loadMoreK()}
        onLoadMoreStars={() => void loadMoreStars()}
      />

      <CabinetHistoryDialogs
        showDispute={showDispute}
        onCloseDispute={() => {
          setShowDispute(false);
          setSelectedChatId(null);
        }}
        onSubmitDispute={submitDispute}
        showChatView={showChatView}
        onCloseChatView={() => setShowChatView(false)}
        viewMessages={viewMessages}
        viewPartnerName={viewPartnerName}
        language={language}
        summaryVisible={summaryVisible}
        battleSummary={battleSummary}
        summaryLoading={summaryLoading}
        onCloseSummary={closeSummary}
        t={t}
      />

      <CabinetHistoryScrollbarStyle />
    </div>
  );
}

