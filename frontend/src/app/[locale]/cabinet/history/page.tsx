'use client';

import { useEffect, useState } from 'react';
import { PageBackground } from '@/components/PageBackground';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { DisputeModal } from '@/components/chat/DisputeModal';
import { Eye, UserPlus, Trash2, AlertTriangle, X } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { BattleSummaryOverlay } from '@/components/battle/BattleSummaryOverlay';
import { parseBattleSummaryPayload, type BattleSummary, type BattleSummaryPayload } from '@/lib/battleSummary';
import { useI18n } from '@/context/I18nContext';
import { getAppealStatusLabel, getComplaintReasonLabel } from '@/lib/chatComplaint';
import { formatDateTime, formatNumber } from '@/utils/formatters';

type ChatMessage = {
  sender: string;
  content: string;
  sentAt: string;
};

type ChatHistoryEntry = {
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

type BattleHistoryEntry = {
  battleId: string;
  endedAt?: string;
  lightDamage?: number;
  darknessDamage?: number;
  attendanceCount?: number;
  result?: 'light' | 'dark' | 'draw';
  userDamage?: number;
};

type RadianceHistoryItem = {
  amount: number;
  activityType: string;
  occurredAt?: string;
  meta?: Record<string, unknown>;
};

type EconomyHistoryItem = {
  _id: string;
  type: string;
  direction: 'credit' | 'debit';
  currency: 'K' | 'STAR';
  amount: number;
  description?: string;
  relatedEntity?: string;
  occurredAt?: string;
};

// Модальное окно для просмотра переписки
function ChatViewModal({
  isOpen,
  onClose,
  messages,
  partnerName,
  t,
  language,
}: {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  partnerName: string;
  t: (key: string) => string;
  language: string;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-h3 text-white">{t('history.chat_with')} {partnerName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{t('history.no_messages')}</p>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className="rounded-lg bg-gray-800/50 p-3">
                <div className="flex items-center gap-2 text-tiny text-gray-500 mb-1">
                  <span className="font-medium text-gray-400">{(msg.sender || 'unknown') === 'unknown' ? t('history.participant') : String(msg.sender).slice(-6)}</span>
                  <span>•</span>
                  <span>{formatDateTime(msg.sentAt, language)}</span>
                </div>
                <p className="text-white text-secondary">{msg.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function CabinetHistoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { language, t } = useI18n();
  const [chats, setChats] = useState<ChatHistoryEntry[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showChatView, setShowChatView] = useState(false);
  const [viewMessages, setViewMessages] = useState<ChatMessage[]>([]);
  const [viewPartnerName, setViewPartnerName] = useState('');
  const [battleHistory, setBattleHistory] = useState<BattleHistoryEntry[]>([]);
  const [loadingBattles, setLoadingBattles] = useState(false);
  const [radianceHistory, setRadianceHistory] = useState<RadianceHistoryItem[]>([]);
  const [radianceTotal, setRadianceTotal] = useState<number>(0);
  const [scHistory, setScHistory] = useState<EconomyHistoryItem[]>([]);
  const [scTotal, setScTotal] = useState<number>(0);
  const [starsHistory, setStarsHistory] = useState<EconomyHistoryItem[]>([]);
  const [starsTotal, setStarsTotal] = useState<number>(0);

  const RADIANCE_ACTIVITY_NAMES: Record<string, string | ((amount: number) => string)> = {
    chat_1h: t('history.chat_1h'),
    chat_rate: (amount: number) => (amount === 2
      ? t('history.chat_rating_liked')
      : t('history.chat_rating_disliked')),
    friend_add: t('history.add_friend'),
    wish_create: t('history.make_wishes'),
    wish_support: t('history.support_wish'),
    bridge_contribute: t('history.place_stone'),
    bridge_create: t('history.start_bridge'),
    fortune_spin: t('history.wheel_fortune'),
    lottery_ticket_buy: t('history.lottery_purchase'),
    personal_luck: t('history.personal_luck'),
    entity_create: t('history.create_entity'),
    solar_collect: t('history.collect_lumens_hourly'),
    solar_share: t('history.share_lumens'),
    evil_root_confession: t('history.write_confessions'),
    tree_heal_button: t('history.heal_tree_directly'),
    news_like: t('history.post_like'),
    news_comment: t('history.comment'),
    news_repost: t('history.repost'),
    news_view: t('history.viewed_post'),
    achievement_any: t('history.achievement'),
    shard_collect: t('history.shard_collection'),
    night_shift: t('history.night_shift'),
    night_shift_anomaly: t('history.night_shift_anomaly'),
    night_shift_hour: t('history.night_shift_full_hour'),
    attendance_day: t('history.attendance_day'),
    shop_buy_item: t('history.shop_purchase'),
    shop_use_item: t('history.storage_use'),
    referral_active: t('history.referrals'),
    feedback_letter: t('history.feedback'),
    meditation_individual: t('history.individual_meditation'),
    meditation_group: t('history.group_meditation'),
    gratitude_write: t('history.write_gratitude'),
    fruit_collect: t('history.collect_fruit'),
  };

  const SC_TYPE_NAMES: Record<string, string> = {
    attendance_bonus: t('history.attendance_day'),
    solar_collect: t('history.solar_charge'),
    solar_share: t('history.transfer_lumens'),
    gratitude_write: t('history.gratitude'),
    crystal: t('history.shard_collection'),
    fruit_collect: t('history.fruit_collection'),
    night_shift: t('history.night_shift_cap'),
    appeal_compensation: t('history.compensation'),
    chat: t('history.chat'),
    battle: t('history.battle_damage_reward'),
    fortune: t('history.fortune'),
    referral: t('history.referral_bonus'),
    referral_blessing: t('history.referral_blessing'),
    wish: t('history.make_wishes'),
    stars: t('history.star_reward'),
    news_like: t('history.post_like'),
    news_comment: t('history.comment'),
    news_repost: t('history.repost'),
  };

  const STAR_TYPE_NAMES: Record<string, string> = {
    gratitude_write: t('history.gratitude'),
    solar_share: t('history.transfer_lumens'),
    fortune_roulette: t('history.wheel_fortune'),
    fruit_collect: t('history.fruit_collection'),
    tree_heal: t('history.heal_tree'),
    wish_fulfill: t('history.wish_fulfilled'),
    chat_rating: t('history.chat_rating'),
    crystal: t('history.shard_collection'),
    night_shift: t('history.night_shift_cap'),
    stars: t('history.stars'),
  };

  const BOOST_TYPE_NAMES: Record<string, string> = {
    gratitude_ad_boost: t('history.ad_boost_gratitude'),
    solar_ad_boost: t('history.ad_boost_solar'),
    roulette_ad_boost: t('history.ad_boost_roulette'),
    night_shift_ad_boost: t('history.ad_boost_night_shift'),
    crystal_ad_boost: t('history.ad_boost_crystal'),
    battle_ad_boost: t('history.ad_boost_battle'),
    fruit_ad_boost: t('history.ad_boost_fruit'),
    attendance_ad_boost: t('history.ad_boost_attendance'),
    personal_luck_ad_reward: t('history.ad_boost_personal_luck'),
    chat_boost: t('history.ad_boost_chat_key'),
    referral_blessing: t('history.ad_boost_referral_blessing'),
    ad_boost: t('history.ad_boost_generic'),
  };

  const getRadianceActivityName = (activityType: string, amount: number) => {
    const row = RADIANCE_ACTIVITY_NAMES[String(activityType || '')];
    if (typeof row === 'function') return row(amount);
    return row || activityType;
  };

  const getTreeHealConversionText = (row: RadianceHistoryItem) => {
    if (row.activityType !== 'tree_heal_button') return null;
    const lumens = Number(row.meta?.lumens);
    if (!Number.isFinite(lumens) || lumens <= 0) return null;

    const radiance = Number(row.meta?.radiance);
    const safeRadiance = Number.isFinite(radiance) && radiance > 0 ? radiance : (Number(row.amount) || 0);

    return `−${formatNumber(lumens, language)} Lm = +${formatNumber(safeRadiance, language)} ${t('cabinet.radiance')}`;
  };

  const isExplicitBoostDescription = (description?: string | null) => {
    const normalized = String(description || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized.startsWith('\u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u0430\u044f \u043d\u0430\u0433\u0440\u0430\u0434\u0430')
      || normalized.startsWith('extra reward');
  };

  const resolveEconomyDescriptionKey = (description?: string | null) => {
    const normalized = String(description || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    if (!normalized) return null;
    if (normalized.includes('\u043b\u0438\u0447\u043d\u0430\u044f \u0443\u0434\u0430\u0447\u0430') || normalized.includes('personal luck')) return 'history.personal_luck';
    if (normalized.includes('\u0432\u044b\u0438\u0433\u0440\u044b\u0448 \u0432 \u043a\u043e\u043b\u0435\u0441\u0435 \u0444\u043e\u0440\u0442\u0443\u043d\u044b') || normalized.includes('fortune wheel winnings')) return 'history.wheel_fortune';
    if (normalized.includes('\u0432\u044b\u0438\u0433\u0440\u044b\u0448 \u0432 \u043b\u043e\u0442\u0435\u0440\u0435\u044e') || normalized.includes('lottery winnings')) return 'history.lottery_winnings';
    if (normalized.includes('\u043f\u043e\u0441\u0435\u0449\u0430\u0435\u043c\u043e\u0441\u0442\u044c: \u0434\u0435\u043d\u044c') || normalized.includes('attendance: day')) return 'history.attendance_day';
    if (normalized.includes('\u0441\u0431\u043e\u0440 \u0441\u043e\u043b\u043d\u0435\u0447\u043d\u043e\u0433\u043e \u0437\u0430\u0440\u044f\u0434\u0430') || normalized.includes('solar charge collection')) return 'history.solar_charge';
    if (normalized.includes('\u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043b\u044e\u043c\u0435\u043d\u043e\u0432') || normalized.includes('lumens transfer')) return 'history.transfer_lumens';
    if (normalized.includes('\u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u044c') || normalized.includes('gratitude')) return 'history.gratitude';
    if (normalized.includes('\u043d\u0430\u0433\u0440\u0430\u0434\u0430 \u0437\u0430 \u0443\u0440\u043e\u043d \u0432 \u0431\u043e\u044e') || normalized.includes('battle damage reward')) return 'history.battle_damage_reward';
    if (normalized.includes('\u0431\u043b\u0430\u0433\u043e\u0441\u043b\u043e\u0432\u0435\u043d\u0438\u0435 \u0440\u0435\u0444\u0435\u0440\u0430\u043b\u043e\u0432') || normalized.includes('referral blessing')) return 'history.referral_blessing';
    if (normalized.includes('\u0431\u043e\u043d\u0443\u0441 \u0437\u0430 \u0440\u0435\u0444\u0435\u0440\u0430\u043b\u0430') || normalized.includes('referral bonus')) return 'history.referral_bonus';
    if (normalized.includes('\u0440\u0435\u0444\u0435\u0440\u0430\u043b')) return 'history.referrals';
    return null;
  };

  const getEconomyEntryName = (row: EconomyHistoryItem, mode: 'sc' | 'stars') => {
    if (isExplicitBoostDescription(row.description)) return String(row.description || '').trim();
    const boostTypeName = BOOST_TYPE_NAMES[String(row.type || '')];
    if (boostTypeName) return boostTypeName;
    const descriptionKey = resolveEconomyDescriptionKey(row.description);
    if (descriptionKey) return t(descriptionKey);
    const map = mode === 'sc' ? SC_TYPE_NAMES : STAR_TYPE_NAMES;
    const typeKey = map[String(row.type || '')];
    if (typeKey) return typeKey;
    if (row.description) return row.description;
    return row.type || t('history.credit');
  };
  const [loadingRadiance, setLoadingRadiance] = useState(false);
  const [loadingSc, setLoadingSc] = useState(false);
  const [loadingStars, setLoadingStars] = useState(false);
  const [battleSummary, setBattleSummary] = useState<BattleSummary | null>(null);
  const [summaryBattleId, setSummaryBattleId] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'battles' | 'chats' | 'radiance' | 'sc' | 'stars'>('battles');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) return;
      setLoadingChats(true);
      setChatError('');
      try {
        const data = await apiGet<ChatHistoryEntry[]>('/chats/history');
        if (!cancelled) setChats(data || []);
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
        const data = await apiGet<{ battles: BattleHistoryEntry[] }>('/battles/history');
        if (!cancelled) setBattleHistory(data?.battles || []);
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
        const [historyRes, totalRes] = await Promise.all([
          apiGet<{ items: RadianceHistoryItem[] }>('/radiance/history?limit=100&offset=0'),
          apiGet<{ total: number }>('/radiance/total-earned'),
        ]);
        if (!cancelled) {
          setRadianceHistory(historyRes?.items || []);
          setRadianceTotal(Number(totalRes?.total) || 0);
        }
      } catch {
        if (!cancelled) {
          setRadianceHistory([]);
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
    const loadSc = async () => {
      if (!user) return;
      setLoadingSc(true);
      try {
        const [historyRes, totalRes] = await Promise.all([
          apiGet<{ items: EconomyHistoryItem[] }>('/economy/history?currency=K&direction=credit&limit=100&offset=0'),
          apiGet<{ total: number }>('/economy/total-earned?currency=K&direction=credit'),
        ]);
        if (!cancelled) {
          setScHistory(historyRes?.items || []);
          setScTotal(Number(totalRes?.total) || 0);
        }
      } catch {
        if (!cancelled) {
          setScHistory([]);
          setScTotal(0);
        }
      } finally {
        if (!cancelled) setLoadingSc(false);
      }
    };
    loadSc();
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
        const [historyRes, totalRes] = await Promise.all([
          apiGet<{ items: EconomyHistoryItem[] }>('/economy/history?currency=STAR&direction=credit&limit=100&offset=0'),
          apiGet<{ total: number }>('/economy/total-earned?currency=STAR&direction=credit'),
        ]);
        if (!cancelled) {
          setStarsHistory(historyRes?.items || []);
          setStarsTotal(Number(totalRes?.total) || 0);
        }
      } catch {
        if (!cancelled) {
          setStarsHistory([]);
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

  // Получить ID из объекта или строки
  const getId = (obj: { _id: string } | string | undefined): string => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj._id;
  };

  const handleDisputeClick = (chatId: string) => {
    setSelectedChatId(chatId);
    setShowDispute(true);
  };

  const submitDispute = async (text: string) => {
    if (!selectedChatId) return;

    try {
      await apiPost(`/appeals/${selectedChatId}/appeal-text`, { appealText: text });
      const data = await apiGet<ChatHistoryEntry[]>('/chats/history');
      setChats(data || []);
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
        const rawMessages = await apiGet<unknown>(`/chats/${chat._id}/messages`);
        const mapped: ChatMessage[] = Array.isArray(rawMessages)
          ? rawMessages.map((m) => {
              const row = typeof m === 'object' && m !== null ? (m as Record<string, unknown>) : {};
              const sender = row.senderId ?? row.sender ?? 'unknown';
              const content = row.originalText ?? row.content ?? '';
              const sentAt = row.createdAt ?? row.sentAt ?? new Date().toISOString();
              return {
                sender: String(sender),
                content: String(content),
                sentAt: String(sentAt),
              };
            })
          : [];
        setViewMessages(mapped);
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
      const data = await apiGet<BattleSummaryPayload>(`/battles/summary?battleId=${battleId}`);
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
        const data = await apiGet<BattleSummaryPayload>(`/battles/summary?battleId=${summaryBattleId}`);
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
      <PageBackground />

      <div className="custom-scrollbar relative z-10 h-full overflow-y-auto px-6 py-8 lg:no-scrollbar">
        <div className="space-y-6 pb-12">
          <div className="text-center">
            <PageTitle
              title={t('history.title')}
              Icon={Eye}
              gradientClassName="from-white via-slate-200 to-amber-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-amber-200"
              size="h3"
              className="w-fit mx-auto"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('battles')}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'battles'
                  ? 'border-amber-400/50 bg-amber-400/10 text-amber-200 shadow-[0_0_20px_-5px_rgba(251,191,36,0.3)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              ⚔️ {t('cabinet.battles')}
              <span className="text-caption text-white/50">{battleHistory.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chats')}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'chats'
                  ? 'border-sky-400/50 bg-sky-400/10 text-sky-200 shadow-[0_0_20px_-5px_rgba(56,189,248,0.3)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              💬 {t('cabinet.chats')}
              <span className="text-caption text-white/50">{chats.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('radiance')}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'radiance'
                  ? 'border-violet-400/50 bg-violet-400/10 text-violet-200 shadow-[0_0_20px_-5px_rgba(167,139,250,0.3)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              ✨ {t('cabinet.radiance')}
              <span className="text-caption text-white/50">{radianceHistory.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sc')}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'sc'
                  ? 'border-amber-400/50 bg-amber-400/10 text-amber-200 shadow-[0_0_20px_-5px_rgba(251,191,36,0.3)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              🪙 K
              <span className="text-caption text-white/50">{scHistory.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stars')}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'stars'
                  ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_-5px_rgba(34,211,238,0.3)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              ⭐ {t('cabinet.stars')}
              <span className="text-caption text-white/50">{starsHistory.length}</span>
            </button>
          </div>

          {activeTab === 'battles' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-h3">{t('battle.history')}</h2>
                  <p className="text-secondary text-white/70">{t('battle.history_review')}</p>
                </div>
                {loadingBattles && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
              </div>
              <div className="mt-4 space-y-3">
                {battleHistory.map((battle) => {
                  const endedAt = battle.endedAt ? new Date(battle.endedAt) : null;
                  const endedAtText = endedAt && !Number.isNaN(endedAt.getTime()) ? formatDateTime(endedAt, language) : '—';
                  const isDraw = battle.result === 'draw';
                  const isLight = battle.result === 'light';
                  return (
                    <div key={battle.battleId} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                        <span className="font-semibold text-white">{t('battle.title')} #{String(battle.battleId).slice(-6)}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-tiny uppercase ${isDraw
                            ? 'border-slate-400/40 bg-slate-400/10 text-slate-200'
                            : isLight
                              ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                              : 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                            }`}
                        >
                          {battle.result ? (isDraw ? t('battle.draw') : isLight ? t('battle.victory_light') : t('battle.victory_darkness')) : '—'}
                        </span>
                        <span className="text-tiny text-white/60">{endedAtText}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-tiny text-white/60">
                        <span>{t('history.your_damage')}: <span className="text-white">{formatNumber(battle.userDamage || 0, language)}</span></span>
                        <span>{t('history.light')}: {formatNumber(battle.lightDamage || 0, language)}</span>
                        <span>{t('history.darkness')}: {formatNumber(battle.darknessDamage || 0, language)}</span>
                        <span>{t('history.battle_attendance')}: {formatNumber(battle.attendanceCount || 0, language)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleViewBattleSummary(String(battle.battleId))}
                          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-tiny text-white hover:border-white/40 transition"
                        >
                          <Eye size={14} />
                          {t('battle.result')}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {battleHistory.length === 0 && !loadingBattles && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
                    {t('battle.history_empty')}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'chats' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-h3">{t('history.chat_history')}</h2>
                  <p className="text-secondary text-white/70">{t('history.complaints_visible')}</p>
                </div>
                {loadingChats && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
              </div>
              {chatError && <div className="mt-3 text-secondary text-rose-300">{chatError}</div>}
              <div className="mt-4 space-y-3">
                {chats.map((chat) => {
                  const complaint = chat.complaint;
                  const complaintToId = getId(complaint?.to);
                  const youAreAccused = complaintToId && user?._id && complaintToId === user._id;

                  const canDispute =
                    youAreAccused &&
                    !!complaint?.appealId &&
                    !complaint.appealId.appealedAt &&
                    !!complaint?.autoResolveAt &&
                    new Date(complaint.autoResolveAt).getTime() > Date.now();
                  const canViewTranscript = Boolean(complaint || chat.relationship?.isFriend);

                  // Находим партнера
                  const partner = chat.participants.find(p => p._id !== user?._id);

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

                      {/* Кнопки действий */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {/* Просмотр переписки */}
                        {canViewTranscript && (
                          <button
                            onClick={() => handleViewChat(chat)}
                            className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-tiny text-white hover:border-white/40 transition"
                          >
                            <Eye size={14} />
                            {t('history.view')}
                          </button>
                        )}

                        {/* Добавить в друзья */}
                        {partner && chat.relationship?.canSendFriendRequest && (
                          <button
                            onClick={() => handleAddFriend(partner._id, partner.nickname || t('chat.partner'))}
                            className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-tiny text-emerald-200 hover:border-emerald-400/50 transition"
                          >
                            <UserPlus size={14} />
                            {t('chat.add_friend')}
                          </button>
                        )}

                        {/* Оспорить жалобу */}
                        {canDispute && (
                          <button
                            onClick={() => handleDisputeClick(chat._id)}
                            className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-tiny text-amber-200 hover:border-amber-400/50 transition"
                          >
                            <AlertTriangle size={14} />
                            {t('chat.resolve')}
                          </button>
                        )}

                        {/* Удалить переписку */}
                        <button
                          onClick={() => handleDeleteChat(chat._id)}
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
              </div>
            </div>
          )}

          {activeTab === 'radiance' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-h3">{t('cabinet.radiance')}</h2>
                  <p className="text-secondary text-white/70">{t('history.radiance_desc')}</p>
                </div>
                <div className="flex items-center gap-3">
                  {loadingRadiance && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
                  <div className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-tiny text-violet-200">
                    {t('history.total')}: <span className="font-semibold">{formatNumber(radianceTotal, language)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {radianceHistory.map((row, idx) => {
                  const at = row.occurredAt ? new Date(row.occurredAt) : null;
                  const atText = at && !Number.isNaN(at.getTime()) ? formatDateTime(at, language) : '—';
                  const treeHealConversion = getTreeHealConversionText(row);
                  return (
                    <div key={`${row.activityType}-${idx}-${row.amount}`} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                        <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-tiny text-violet-200">
                          +{formatNumber(row.amount || 0, language)} {t('cabinet.radiance')}
                        </span>
                        <span className="text-white/80">{getRadianceActivityName(row.activityType, row.amount || 0)}</span>
                        <span className="text-tiny text-white/60">{atText}</span>
                      </div>
                      {treeHealConversion && (
                        <div className="mt-2 text-tiny text-emerald-200/80">
                          {treeHealConversion}
                        </div>
                      )}
                    </div>
                  );
                })}

                {radianceHistory.length === 0 && !loadingRadiance && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
                    {t('history.no_earnings')}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sc' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-h3">K</h2>
                  <p className="text-secondary text-white/70">{t('history.sc_desc')}</p>
                </div>
                <div className="flex items-center gap-3">
                  {loadingSc && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
                  <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-tiny text-amber-200">
                    {t('history.total')}: <span className="font-semibold">{formatNumber(scTotal, language)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {scHistory.map((row) => {
                  const at = row.occurredAt ? new Date(row.occurredAt) : null;
                  const atText = at && !Number.isNaN(at.getTime()) ? formatDateTime(at, language) : '—';
                  return (
                    <div key={row._id} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-tiny text-amber-200">
                          +{formatNumber(row.amount || 0, language)} K
                        </span>
                        <span className="text-white/80">{getEconomyEntryName(row, 'sc')}</span>
                        <span className="text-tiny text-white/60">{atText}</span>
                      </div>
                    </div>
                  );
                })}

                {scHistory.length === 0 && !loadingSc && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
                    {t('history.no_earnings')}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stars' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-h3">{t('cabinet.stars')}</h2>
                  <p className="text-secondary text-white/70">{t('history.stars_desc')}</p>
                </div>
                <div className="flex items-center gap-3">
                  {loadingStars && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
                  <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-tiny text-cyan-200">
                    {t('history.total')}: <span className="font-semibold">{starsTotal.toFixed(3)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {starsHistory.map((row) => {
                  const at = row.occurredAt ? new Date(row.occurredAt) : null;
                  const atText = at && !Number.isNaN(at.getTime()) ? formatDateTime(at, language) : '—';
                  return (
                    <div key={row._id} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-tiny text-cyan-200">
                          +{(row.amount || 0).toFixed(3)} ⭐
                        </span>
                        <span className="text-white/80">{getEconomyEntryName(row, 'stars')}</span>
                        <span className="text-tiny text-white/60">{atText}</span>
                      </div>
                    </div>
                  );
                })}

                {starsHistory.length === 0 && !loadingStars && (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
                    {t('history.no_earnings')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <DisputeModal
        isOpen={showDispute}
        onClose={() => {
          setShowDispute(false);
          setSelectedChatId(null);
        }}
        onSubmit={submitDispute}
      />

      <ChatViewModal
        isOpen={showChatView}
        onClose={() => setShowChatView(false)}
        messages={viewMessages}
        partnerName={viewPartnerName}
        t={t}
        language={language}
      />

      <BattleSummaryOverlay
        isOpen={summaryVisible}
        summary={battleSummary}
        loading={summaryLoading}
        playAnimation={false}
        onClose={closeSummary}
        onPrimaryAction={closeSummary}
        primaryActionLabel={t('common.close')}
      />

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

