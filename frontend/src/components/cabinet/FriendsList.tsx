'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';

interface Friend {
    _id: string;
    nickname: string;
    gender: string;
    avatar?: string;
    isOnline?: boolean;
}

interface FriendRequest {
    _id: string;
    from: Friend;
    createdAt: string;
}

type FriendRequestsApiResponse = FriendRequest[] | { requests?: FriendRequest[] };

export function FriendsList() {
    const { user } = useAuth();
    const toast = useToast();
    const { t } = useI18n();
    const socket = useSocket(user?._id);
    const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'blocked'>('friends');
    const [friends, setFriends] = useState<Friend[]>([]);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [blocked, setBlocked] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);

    const handleInvite = (friendId: string) => {
        if (!socket) return;
        socket.emit('invite_friend', { friendId });
    };

    const fetchFriends = useCallback(async () => {
        try {
            const data = await apiGet<Friend[]>('/match/friends/list');
            const normalized = (Array.isArray(data) ? data : [])
                .map((friend) => ({
                    _id: String(friend?._id || ''),
                    nickname: String(friend?.nickname || '').trim() || t('common.user'),
                    gender: String(friend?.gender || 'other'),
                    avatar: friend?.avatar,
                    isOnline: Boolean(friend?.isOnline),
                }))
                .filter((friend) => friend._id);
            setFriends(normalized);
        } catch (error) {
            console.error('Error fetching friends:', error);
        }
    }, [t]);

    const fetchRequests = useCallback(async () => {
        try {
            const data = await apiGet<FriendRequestsApiResponse>('/match/friends/requests');
            const raw = Array.isArray(data)
                ? data
                : Array.isArray(data?.requests)
                    ? data.requests
                    : [];

            const normalized = raw
                .map((req) => ({
                    _id: String(req?._id || ''),
                    from: {
                        _id: String(req?.from?._id || ''),
                        nickname: String(req?.from?.nickname || '').trim() || t('common.user'),
                        gender: String(req?.from?.gender || 'other'),
                        avatar: req?.from?.avatar,
                    },
                    createdAt: String(req?.createdAt || ''),
                }))
                .filter((req) => req._id && req.from._id);

            setRequests(normalized);
        } catch (error) {
            console.error('Error fetching requests:', error);
        }
    }, [t]);

    const fetchBlocked = useCallback(async () => {
        try {
            const data = await apiGet<Friend[]>('/match/block/list');
            setBlocked(data);
        } catch (error) {
            console.error('Error fetching blocked users:', error);
        }
    }, []);

    useEffect(() => {
        if (!socket) return;

        const resolveSocketMessage = (data: unknown, fallbackKey: string) => {
            const row = typeof data === 'object' && data !== null ? data as { message?: unknown; messageKey?: unknown } : null;
            const translated = typeof row?.messageKey === 'string' ? t(row.messageKey) : '';
            const direct = typeof row?.message === 'string' ? row.message : '';
            return translated || direct || t(fallbackKey);
        };

        socket.on('invite_error', (data: unknown) => {
            toast.error(t('common.error'), resolveSocketMessage(data, 'friends.invite_error'));
        });
        socket.on('invite_sent', (data: unknown) => {
            const message = resolveSocketMessage(data, 'friends.invite_sent');
            if (message) {
                toast.success(message);
            }
        });
        socket.on('friends_updated', () => {
            fetchFriends();
            fetchRequests();
        });

        return () => {
            socket.off('invite_error');
            socket.off('invite_sent');
            socket.off('friends_updated');
        };
    }, [fetchFriends, fetchRequests, socket, t, toast]);

    useEffect(() => {
        setLoading(true);
        if (activeTab === 'friends') {
            fetchFriends().finally(() => setLoading(false));
        } else if (activeTab === 'requests') {
            fetchRequests().finally(() => setLoading(false));
        } else {
            fetchBlocked().finally(() => setLoading(false));
        }
    }, [activeTab, fetchBlocked, fetchFriends, fetchRequests]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    useEffect(() => {
        if (activeTab !== 'friends') return;
        const intervalId = window.setInterval(() => {
            fetchFriends();
        }, 15000);
        return () => window.clearInterval(intervalId);
    }, [activeTab, fetchFriends]);

    const handleAccept = async (requesterId: string) => {
        try {
            await apiPost('/match/friends/accept', { requesterId });
            setRequests((prev) => prev.filter((r) => r.from._id !== requesterId));
            fetchFriends();
            fetchRequests();
        } catch (error) {
            toast.error(t('common.error'), t('friends.accept_error'));
        }
    };

    const handleReject = async (requesterId: string) => {
        try {
            await apiPost('/match/friends/reject', { requesterId });
            setRequests((prev) => prev.filter((r) => r.from._id !== requesterId));
        } catch (error) {
            toast.error(t('common.error'), t('friends.reject_error'));
        }
    };

    const handleRemove = async (friendId: string, nickname: string) => {
        if (!confirm(`${t('friends.remove_confirm_prefix')} ${nickname} ${t('friends.remove_confirm_suffix')}`)) return;
        try {
            await apiPost('/match/friends/remove', { friendId });
            setFriends((prev) => prev.filter((f) => f._id !== friendId));
        } catch (error) {
            toast.error(t('common.error'), t('friends.remove_error'));
        }
    };

    const handleUnblock = async (userId: string, nickname: string) => {
        if (!confirm(`${t('friends.unblock_confirm_prefix')} ${nickname}${t('friends.unblock_confirm_suffix')}`)) return;
        try {
            await apiPost('/match/block/unblock', { userId });
            setBlocked((prev) => prev.filter((u) => u._id !== userId));
        } catch (error) {
            toast.error(t('common.error'), t('friends.unblock_error'));
        }
    };

    const onlineFriends = friends.filter((friend) => Boolean(friend.isOnline));
    const offlineFriends = friends.filter((friend) => !friend.isOnline);

    return (
        <div className="w-full max-w-2xl mx-auto rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
            <div className="mb-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-b border-white/10 pb-2">
                <button
                    onClick={() => setActiveTab('friends')}
                    className={`pb-2 text-body transition-colors ${activeTab === 'friends' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white'}`}
                >
                    {t('friends.my_friends')}
                </button>
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`pb-2 text-body transition-colors ${activeTab === 'requests' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white'}`}
                >
                    {t('friends.requests')}
                    {requests.length > 0 && activeTab !== 'requests' && (
                        <span className="ml-2 bg-rose-500 text-white text-xs rounded-full px-2 py-0.5">!</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('blocked')}
                    className={`pb-2 text-body transition-colors ${activeTab === 'blocked' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white'}`}
                >
                    {t('friends.blocked')}
                </button>
            </div>

            <div className="">
                {loading ? (
                    <div className="flex justify-center items-center h-40 text-white/40">{t('common.loading')}</div>
                ) : (
                    <AnimatePresence mode="wait">
                        {activeTab === 'friends' ? (
                            <motion.div
                                key="friends"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {friends.length === 0 ? (
                                    <div className="text-center py-6 text-white/40">
                                        {t('friends.empty_friends')}
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        <div>
                                            <div className="mb-3 flex items-center gap-3">
                                                <span className="text-tiny uppercase tracking-widest text-emerald-300">
                                                    {t('friends.online')} ({onlineFriends.length})
                                                </span>
                                                <div className="h-px flex-1 bg-emerald-400/20" />
                                            </div>
                                            {onlineFriends.length === 0 ? (
                                                <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/5 p-4 text-tiny text-white/50">
                                                    {t('friends.no_one_online')}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {onlineFriends.map((friend) => (
                                                        <div key={friend._id} className="flex items-center justify-between bg-emerald-500/5 p-4 rounded-xl border border-emerald-400/20">
                                                            <div className="flex items-center space-x-4">
                                                                <div className="relative w-10 h-10 rounded-full bg-linear-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-bold text-lg">
                                                                    {friend.nickname[0].toUpperCase()}
                                                                    <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-400" />
                                                                </div>
                                                                <div>
                                                                    <div className="text-body font-bold text-white">{friend.nickname}</div>
                                                                    <div className="text-tiny text-emerald-300">{t('friends.status_online')}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center">
                                                                <button
                                                                    onClick={() => handleInvite(friend._id)}
                                                                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white rounded-xl text-tiny font-medium transition-all shadow-lg hover:shadow-purple-500/20 mr-2"
                                                                >
                                                                    {t('friends.invite')}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRemove(friend._id, friend.nickname)}
                                                                    className="text-tiny text-rose-400 hover:text-rose-300 transition-colors"
                                                                >
                                                                    {t('friends.remove')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div className="mb-3 flex items-center gap-3">
                                                <span className="text-tiny uppercase tracking-widest text-white/60">
                                                    {t('friends.offline')} ({offlineFriends.length})
                                                </span>
                                                <div className="h-px flex-1 bg-white/10" />
                                            </div>
                                            {offlineFriends.length === 0 ? (
                                                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-tiny text-white/50">
                                                    {t('friends.all_online')}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {offlineFriends.map((friend) => (
                                                        <div key={friend._id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/10">
                                                            <div className="flex items-center space-x-4">
                                                                <div className="relative w-10 h-10 rounded-full bg-linear-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white font-bold text-lg">
                                                                    {friend.nickname[0].toUpperCase()}
                                                                    <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-slate-500" />
                                                                </div>
                                                                <div>
                                                                    <div className="text-body font-bold text-white">{friend.nickname}</div>
                                                                    <div className="text-tiny text-white/50">{t('friends.status_offline')}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center">
                                                                <button
                                                                    disabled
                                                                    className="px-4 py-2 bg-white/10 text-white/50 rounded-xl text-tiny font-medium cursor-not-allowed mr-2"
                                                                >
                                                                    {t('friends.status_offline')}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRemove(friend._id, friend.nickname)}
                                                                    className="text-tiny text-rose-400 hover:text-rose-300 transition-colors"
                                                                >
                                                                    {t('friends.remove')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ) : activeTab === 'requests' ? (
                            <motion.div
                                key="requests"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {requests.length === 0 ? (
                                    <div className="text-center py-6 text-white/40">
                                        {t('friends.no_requests')}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {requests.map((req) => (
                                            <div key={req._id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                                                <div className="flex items-center space-x-4">
                                                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                                                        {(req.from.nickname[0] || t('common.user')[0] || 'U').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-body font-bold text-white">{req.from.nickname}</div>
                                                        <div className="text-tiny text-white/40">{t('friends.wants_add_you')}</div>
                                                    </div>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => handleAccept(req.from._id)}
                                                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white text-tiny font-medium transition-colors"
                                                    >
                                                        {t('common.accept')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(req.from._id)}
                                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-tiny font-medium transition-colors"
                                                    >
                                                        {t('common.reject')}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="blocked"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {blocked.length === 0 ? (
                                    <div className="text-center py-6 text-white/40">
                                        {t('friends.blocked_empty')}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {blocked.map((user) => (
                                            <div key={user._id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                                                <div className="flex items-center space-x-4">
                                                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-lg">
                                                        {user.nickname[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-body font-bold text-white text-gray-400">{user.nickname}</div>
                                                        <div className="text-tiny text-white/40">{t('friends.blocked_status')}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleUnblock(user._id, user.nickname)}
                                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-tiny font-medium transition-colors"
                                                >
                                                    {t('friends.unblock')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
