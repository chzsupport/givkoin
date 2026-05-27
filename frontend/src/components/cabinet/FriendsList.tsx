'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';
import { FriendsListContent } from './friends/FriendsListContent';
import { FriendsTabs } from './friends/FriendsTabs';
import { normalizeFriendList, normalizeFriendRequests, resolveFriendSocketMessage } from './friends/friendsUtils';
import type { Friend, FriendRequest, FriendRequestsApiResponse, FriendsTab } from './friends/types';

export function FriendsList() {
    const { user } = useAuth();
    const toast = useToast();
    const { t } = useI18n();
    const socket = useSocket(user?._id);
    const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
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
            setFriends(normalizeFriendList(data, t));
        } catch (error) {
            console.error('Error fetching friends:', error);
        }
    }, [t]);

    const fetchRequests = useCallback(async () => {
        try {
            const data = await apiGet<FriendRequestsApiResponse>('/match/friends/requests');
            setRequests(normalizeFriendRequests(data, t));
        } catch (error) {
            console.error('Error fetching requests:', error);
        }
    }, [t]);

    const fetchBlocked = useCallback(async () => {
        try {
            const data = await apiGet<Friend[]>('/match/block/list');
            setBlocked(normalizeFriendList(data, t));
        } catch (error) {
            console.error('Error fetching blocked users:', error);
        }
    }, [t]);

    useEffect(() => {
        if (!socket) return;

        socket.on('invite_error', (data: unknown) => {
            toast.error(t('common.error'), resolveFriendSocketMessage(data, 'friends.invite_error', t));
        });
        socket.on('invite_sent', (data: unknown) => {
            const message = resolveFriendSocketMessage(data, 'friends.invite_sent', t);
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

    return (
        <div className="w-full max-w-2xl mx-auto rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-6">
            <FriendsTabs
                activeTab={activeTab}
                requestsCount={requests.length}
                t={t}
                onTabChange={setActiveTab}
            />

            <div className="">
                <FriendsListContent
                    activeTab={activeTab}
                    blocked={blocked}
                    friends={friends}
                    loading={loading}
                    requests={requests}
                    t={t}
                    onAccept={handleAccept}
                    onInvite={handleInvite}
                    onReject={handleReject}
                    onRemove={handleRemove}
                    onUnblock={handleUnblock}
                />
            </div>
        </div>
    );
}
