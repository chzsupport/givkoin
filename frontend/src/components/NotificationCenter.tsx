'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { apiGet, apiPost } from '@/utils/api';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/context/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { getSiteLanguageLocale } from '@/i18n/siteLanguage';

interface Notification {
    _id: string;
    type: string;
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

function getNotificationText(notification: Notification, language: string) {
    const localized = language === 'en' ? notification.translations?.en : notification.translations?.ru;
    return {
        title: localized?.title || notification.title,
        message: localized?.message || notification.message,
    };
}

const NOTIFICATION_TYPES = 'system,game,chat_invite,friend_request';

export function NotificationCenter() {
    const { user } = useAuth();
    const socket = useSocket(user?._id);
    const { language, localePath, t } = useI18n();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [hasFetchedList, setHasFetchedList] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inflightFetchRef = useRef<Promise<void> | null>(null);

    const fetchNotificationSummary = useCallback(async () => {
        try {
            const data = await apiGet<{ unreadCount: number }>(
                `/notifications/summary?type=${encodeURIComponent(NOTIFICATION_TYPES)}`
            );
            setUnreadCount(data.unreadCount);
        } catch (error) {
            console.error('Error fetching notification summary:', error);
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (inflightFetchRef.current) {
            return inflightFetchRef.current;
        }

        const request = (async () => {
            try {
                const data = await apiGet<{ notifications: Notification[], unreadCount: number }>(
                    `/notifications?limit=10&type=${encodeURIComponent(NOTIFICATION_TYPES)}`
                );
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount);
                setHasFetchedList(true);
            } catch (error) {
                console.error('Error fetching notifications:', error);
            }
        })().finally(() => {
            inflightFetchRef.current = null;
        });

        inflightFetchRef.current = request;
        return request;
    }, []);

    useEffect(() => {
        if (!user) {
            setNotifications([]);
            setUnreadCount(0);
            setIsOpen(false);
            setHasFetchedList(false);
            inflightFetchRef.current = null;
            return;
        }

        void fetchNotificationSummary();
    }, [fetchNotificationSummary, user]);

    useEffect(() => {
        if (!socket) return;

        socket.on('new_notification', (notification: Notification) => {
            setNotifications((prev) => [notification, ...prev]);
            setUnreadCount((prev) => prev + 1);
        });

        return () => {
            socket.off('new_notification');
        };
    }, [socket]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (notificationId: string) => {
        try {
            await apiPost('/notifications/mark-read', { notificationIds: [notificationId] });
            setNotifications((prev) =>
                prev.map((n) => (n._id === notificationId ? { ...n, isRead: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Error marking read:', error);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.isRead) {
            await handleMarkAsRead(notification._id);
        }
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    const nextOpen = !isOpen;
                    setIsOpen(nextOpen);
                    if (nextOpen && !hasFetchedList) {
                        void fetchNotifications();
                    }
                }}
                className="relative p-2 text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/10"
            >
                <Bell size={24} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-caption font-bold text-white ring-2 ring-black">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-white/10 bg-[#0f0f13] shadow-2xl backdrop-blur-xl z-50 overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
                            <h3 className="text-sm font-medium text-white">{t('notifications.title')}</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={async () => {
                                        await apiPost('/notifications/mark-read', { type: NOTIFICATION_TYPES });
                                        setNotifications((prev) => prev.map(n => ({ ...n, isRead: true })));
                                        setUnreadCount(0);
                                    }}
                                    className="text-xs text-amber-400 hover:text-amber-300"
                                >
                                    {t('notifications.mark_all_read')}
                                </button>
                            )}
                        </div>

                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-white/40">
                                    <Bell size={32} className="mb-2 opacity-50" />
                                    <p className="text-sm">{t('notifications.none')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {notifications.map((notification) => (
                                        (() => {
                                            const link = typeof notification.link === 'string' ? notification.link : '';
                                            const safeHref = link && link.startsWith('/') ? localePath(link) : (link || '#');
                                            const text = getNotificationText(notification, language);
                                            return (
                                        <Link
                                            href={safeHref}
                                            key={notification._id}
                                            onClick={() => handleNotificationClick(notification)}
                                            className={`block px-4 py-3 hover:bg-white/5 transition-colors ${!notification.isRead ? 'bg-white/[0.02]' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${!notification.isRead ? 'bg-amber-400' : 'bg-transparent'}`} />
                                                <div>
                                                    <p className={`text-sm ${!notification.isRead ? 'font-medium text-white' : 'text-white/70'}`}>
                                                        {text.title}
                                                    </p>
                                                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                                                        {text.message}
                                                    </p>
                                                    <p className="text-caption text-white/30 mt-1">
                                                        {new Date(notification.createdAt).toLocaleString(getSiteLanguageLocale(language === 'en' ? 'en' : 'ru'))}
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                            );
                                        })()
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-2 border-t border-white/5 bg-white/5 text-center">
                            <Link href={localePath('/cabinet/notifications')} className="text-xs text-white/40 hover:text-white transition-colors">
                                {t('notifications.all')}
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
