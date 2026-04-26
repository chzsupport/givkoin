'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { PageTitle } from '@/components/PageTitle';
import { Bell } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getSiteLanguageLocale } from '@/i18n/siteLanguage';

interface Notification {
  _id: string;
  type: string;
  eventKey?: string;
  title: string;
  message: string;
  translations?: {
    ru?: { title?: string; message?: string };
    en?: { title?: string; message?: string };
  };
  link?: string;
  isRead: boolean;
  createdAt: string;
}

interface LotteryResult {
  winningNumber: string;
  winningNumbers: number[];
  userTickets: {
    ticketNumber: string;
    numbers: number[];
    matches: number;
  }[];
  prize: number;
  status: string;
  drawDate: string;
}

const NOTIFICATION_TYPES = 'system,game,chat_invite,friend_request';

function getNotificationText(notification: Notification, language: string) {
  const localized = language === 'en' ? notification.translations?.en : notification.translations?.ru;
  return {
    title: localized?.title || notification.title,
    message: localized?.message || notification.message,
  };
}

export default function CabinetNotificationsPage() {
  const { user } = useAuth();
  const { language, localePath, t } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showLotteryModal, setShowLotteryModal] = useState(false);
  const [lotteryData, setLotteryData] = useState<LotteryResult | null>(null);
  const [lotteryLoading, setLotteryLoading] = useState(false);

  const load = async () => {
    const data = await apiGet<{ notifications: Notification[]; unreadCount: number }>(
      `/notifications?limit=50&type=${encodeURIComponent(NOTIFICATION_TYPES)}`
    );
    setItems(data.notifications);
    setUnreadCount(data.unreadCount);
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load()
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [user]);

  const markAllRead = async () => {
    await apiPost('/notifications/mark-read', { type: NOTIFICATION_TYPES });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const markOneRead = async (id: string) => {
    await apiPost('/notifications/mark-read', { notificationIds: [id] });
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const fetchLotteryResults = async (link?: string) => {
    if (!link) return;

    // Пытаемся вытащить drawDate из ссылки
    let drawDate = null;
    try {
      const url = new URL(link, window.location.origin);
      drawDate = url.searchParams.get('drawDate');
    } catch (e) { }

    setLotteryLoading(true);
    setShowLotteryModal(true);
    try {
      const endpoint = drawDate ? `/fortune/lottery/results?date=${drawDate}` : '/fortune/lottery/results';
      const data = await apiGet<LotteryResult>(endpoint);
      setLotteryData(data);
    } catch (err) {
      console.error('Error loading lottery results:', err);
    } finally {
      setLotteryLoading(false);
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative z-10 px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 text-center">
              <PageTitle
                title={t('notifications_page.title')}
                Icon={Bell}
                gradientClassName="from-white via-slate-200 to-amber-200"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-amber-200"
                size="h3"
                className="w-fit mx-auto"
              />
              <p className="text-tiny text-white/50 mt-1">{t('notifications_page.desc')}</p>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-tiny font-bold text-amber-200 hover:bg-amber-500/20 transition-colors"
              >
                {t('notifications_page.read_all')} ({unreadCount})
              </button>
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/60">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/60">{t('notifications_page.no_notifications')}</div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md overflow-hidden">
              <div className="divide-y divide-white/5">
                {items.map((n) => (
                  (() => {
                    const text = getNotificationText(n, language);
                    const safeHref = n.link && n.link.startsWith('/') ? localePath(n.link) : (n.link || '');
                    return (
                  <div
                    key={n._id}
                    className={`px-5 py-4 ${!n.isRead ? 'bg-white/[0.03]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.isRead && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                          <div className={`text-sm ${!n.isRead ? 'font-bold text-white' : 'text-white/80'}`}>{text.title}</div>
                        </div>
                        <div className="text-xs text-white/60 mt-1 break-words">{text.message}</div>
                        <div className="text-caption text-white/30 mt-2">{new Date(n.createdAt).toLocaleString(getSiteLanguageLocale(language === 'en' ? 'en' : 'ru'))}</div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {n.eventKey === 'lottery_draw_result' && (
                          <button
                            onClick={() => {
                              if (!n.isRead) markOneRead(n._id).catch(() => { });
                              fetchLotteryResults(n.link);
                            }}
                            className="text-xs text-amber-300 hover:text-amber-200 font-bold"
                          >
                            {t('notifications_page.check')}
                          </button>
                        )}
                        {safeHref && (
                          <a
                            href={safeHref}
                            className="text-xs text-white/50 hover:text-white"
                            onClick={() => {
                              if (!n.isRead) markOneRead(n._id).catch(() => { });
                            }}
                          >
                            {t('notifications_page.go')}
                          </a>
                        )}
                        {!n.isRead && (
                          <button
                            onClick={() => markOneRead(n._id)}
                            className="text-xs text-white/50 hover:text-white"
                          >
                            {t('notifications_page.read')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showLotteryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0a0b] overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{t('notifications_page.lottery_results')}</h3>
              <button
                onClick={() => {
                  setShowLotteryModal(false);
                  setLotteryData(null);
                }}
                className="text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {lotteryLoading ? (
                <div className="py-10 text-center text-white/60 text-sm">{t('notifications_page.loading_results')}</div>
              ) : !lotteryData ? (
                <div className="py-10 text-center text-red-400 text-sm">{t('notifications_page.load_error')}</div>
              ) : (
                <>
                  <div>
                    <div className="text-label text-white/40 mb-3">{t('notifications_page.winning_combo')}</div>
                    <div className="flex flex-wrap gap-2">
                      {lotteryData.winningNumbers.map((num, i) => (
                        <div key={i} className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-200 font-bold text-sm shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                          {num}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-label text-white/40 mb-3">{t('notifications_page.your_tickets')}</div>
                    <div className="space-y-3">
                      {lotteryData.userTickets.map((ticket, ti) => (
                        <div key={ti} className="p-3 rounded-2xl bg-white/5 border border-white/10">
                          <div className="flex flex-wrap gap-1.5">
                            {ticket.numbers.map((num, ni) => {
                              const isMatch = lotteryData.winningNumbers.includes(num);
                              return (
                                <div
                                  key={ni}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium border ${isMatch
                                    ? 'bg-amber-500 border-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                                    : 'bg-white/5 border-white/10 text-white/60'
                                    }`}
                                >
                                  {num}
                                </div>
                              );
                            })}
                          </div>
                          {ticket.matches > 0 && (
                            <div className="mt-2 text-caption text-amber-400 font-medium">
                              {t('notifications_page.guessed_numbers')}: {ticket.matches}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/40 text-xs">{t('notifications_page.total_prize')}:</span>
                      <span className="text-amber-400 font-bold">{lotteryData.prize} K</span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-1">
                      <span className="text-white/40 text-xs">{t('notifications_page.draw_date')}:</span>
                      <span className="text-white/60 text-xs">{new Date(lotteryData.drawDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5">
              <button
                onClick={() => {
                  setShowLotteryModal(false);
                  setLotteryData(null);
                }}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

