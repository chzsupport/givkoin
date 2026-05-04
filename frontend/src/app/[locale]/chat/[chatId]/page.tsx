'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { RatingModal } from '@/components/chat/RatingModal';
import { ComplaintModal } from '@/components/chat/ComplaintModal';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useActiveChat } from '@/context/ActiveChatContext';
import { useToast } from '@/context/ToastContext';
import { Header } from '@/components/Header';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

type ChatMessage = {
    _id: string;
    text: string;
    translatedText?: string;
    isMine: boolean;
    createdAt: string;
    status?: 'sent' | 'delivered' | 'read';
};

type Relationship = {
    isFriend: boolean;
    hasOutgoingFriendRequest: boolean;
    hasIncomingFriendRequest: boolean;
    canSendFriendRequest: boolean;
};

const CHAT_STRICT_PHASE_MS = 5 * 60 * 1000;
const CHAT_STRICT_HEARTBEAT_MS = 5 * 1000;
const CHAT_RELAXED_HEARTBEAT_MS = 15 * 1000;
const CHAT_HEARTBEAT_ACTIVITY_GRACE_MS = 5 * 60 * 1000;

function isLikelyEmail(value: string) {
    const v = String(value || '').trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function extractParticipant(raw: unknown): { id: string; nickname: string } | null {
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

function readSocketDate(value: unknown): Date | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function readActiveElapsedSeconds(value: unknown): number | null {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.floor(seconds);
}

export default function ChatPage() {
    const { chatId } = useParams();
    const router = useRouter();
    const { user, refreshUser, updateUser } = useAuth();
    const toast = useToast();
    const { clearActiveChat } = useActiveChat();
    const { localePath, t } = useI18n();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [startedAt, setStartedAt] = useState<Date>(new Date());
    const [activeDurationSeconds, setActiveDurationSeconds] = useState(0);
    const [showRating, setShowRating] = useState(false);
    const [showComplaint, setShowComplaint] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [windowWidth, setWindowWidth] = useState(0);
    const [windowHeight, setWindowHeight] = useState(0);
    
    // Состояния для системы ожидания
    const [isWaitingForPartner, setIsWaitingForPartner] = useState(false);
    const [waitingTimeLeft, setWaitingTimeLeft] = useState(60);
    const [waitingMessage, setWaitingMessage] = useState('');
    const [disconnectCount, setDisconnectCount] = useState(0);
    const [maxDisconnects, setMaxDisconnects] = useState(2);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [leaveWarningChatId, setLeaveWarningChatId] = useState<string | null>(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [leaveConfirmChatId, setLeaveConfirmChatId] = useState<string | null>(null);
    const [leaveConfirmIsEarly, setLeaveConfirmIsEarly] = useState(false);
    const knownMessageIdsRef = useRef<Set<string>>(new Set());
    const hasMessagesBaselineRef = useRef(false);
    const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
    const lastLocalActivityAtRef = useRef<number>(Date.now());
    const chatHeartbeatSentAtRef = useRef<number>(0);
    const heartbeatTimeoutRef = useRef<number | null>(null);
    const pausedActiveDurationRef = useRef<number | null>(null);
    const activeDurationSecondsRef = useRef(0);

    useEffect(() => {
        const updateDimensions = () => {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
        };
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    const socket = useSocket(user?._id);

    const playIncomingMessageSound = useCallback(() => {
        const audio = incomingAudioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        audio.play().catch(() => { });
    }, []);

    useEffect(() => {
        incomingAudioRef.current = new Audio('/new-message.mp3');
        incomingAudioRef.current.preload = 'auto';

        return () => {
            if (incomingAudioRef.current) {
                incomingAudioRef.current.pause();
                incomingAudioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        knownMessageIdsRef.current = new Set();
        hasMessagesBaselineRef.current = false;
        lastLocalActivityAtRef.current = Date.now();
        chatHeartbeatSentAtRef.current = 0;
        pausedActiveDurationRef.current = null;
    }, [chatId]);

    const computeActiveDurationSeconds = useCallback(() => {
        return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, [startedAt]);

    useEffect(() => {
        const updateActiveDuration = () => {
            if (isWaitingForPartner) {
                if (pausedActiveDurationRef.current == null) {
                    pausedActiveDurationRef.current = computeActiveDurationSeconds();
                }
                setActiveDurationSeconds(pausedActiveDurationRef.current);
                return;
            }

            pausedActiveDurationRef.current = null;
            setActiveDurationSeconds(computeActiveDurationSeconds());
        };

        updateActiveDuration();
        const timer = window.setInterval(updateActiveDuration, 1000);
        return () => window.clearInterval(timer);
    }, [computeActiveDurationSeconds, isWaitingForPartner]);

    useEffect(() => {
        activeDurationSecondsRef.current = activeDurationSeconds;
    }, [activeDurationSeconds]);

    const fetchMessages = useCallback(async () => {
        if (!chatId || !user) return;
        try {
            const messagesData = await apiGet<unknown>(`/chats/${chatId}/messages`);
            if (!Array.isArray(messagesData)) return;
            const mapped: ChatMessage[] = messagesData.map((raw) => {
                const msg = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
                return {
                    _id: typeof msg._id === 'string' ? msg._id : Math.random().toString(36).slice(2),
                    text: typeof msg.originalText === 'string' ? msg.originalText : '',
                    translatedText: typeof msg.translatedText === 'string' ? msg.translatedText : undefined,
                    isMine: msg.senderId === user._id,
                    createdAt: typeof msg.createdAt === 'string' ? msg.createdAt : new Date().toISOString(),
                    status: (msg.status === 'delivered' || msg.status === 'read' ? msg.status : 'sent') as ChatMessage['status'],
                };
            });

            const hasBaseline = hasMessagesBaselineRef.current;
            const prevIds = knownMessageIdsRef.current;
            const nextIds = new Set<string>(mapped.map((m) => m._id));
            const hasNewIncoming = hasBaseline && mapped.some((m) => !m.isMine && !prevIds.has(m._id));

            knownMessageIdsRef.current = nextIds;
            hasMessagesBaselineRef.current = true;
            setMessages(mapped);

            if (hasNewIncoming) {
                playIncomingMessageSound();
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }, [chatId, playIncomingMessageSound, user]);

    const touchChatActivity = useCallback(() => {
        lastLocalActivityAtRef.current = Date.now();
    }, []);

    useEffect(() => {
        console.log('ChatPage: socket instance:', socket);
        if (!socket || !chatId || !user) return;

        // Join chat
        socket.emit('chat:join', { chatId, userId: user._id });
        touchChatActivity();

        // Listen for messages
        socket.on('new_message', (msg) => {
            const row = typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : {};
            const nextMessage: ChatMessage = {
                _id: typeof row._id === 'string' ? row._id : Math.random().toString(36).slice(2),
                text: typeof row.originalText === 'string' ? row.originalText : '',
                translatedText: typeof row.translatedText === 'string' ? row.translatedText : undefined,
                isMine: row.senderId === user._id,
                createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
                status: 'sent'
            };

            setMessages((prev) => {
                if (prev.some((existing) => existing._id === nextMessage._id)) return prev;
                return [...prev, nextMessage];
            });
            knownMessageIdsRef.current.add(nextMessage._id);
            hasMessagesBaselineRef.current = true;
            if (!nextMessage.isMine) {
                playIncomingMessageSound();
            }
            // Останавливаем индикатор печатания при получении сообщения
            setIsPartnerTyping(false);
        });

        socket.on('partner_left_early', () => {
            // Handle partner left early
        });

        socket.on('chat_ended', (data) => {
            setIsWaitingForPartner(false);
            setWaitingMessage('');
            setWaitingTimeLeft(60);
            const endedDuration = readActiveElapsedSeconds(data?.duration);
            if (endedDuration != null) {
                setActiveDurationSeconds(endedDuration);
            }

            clearActiveChat();

            // Если чат завершился обычным способом (есть duration) — показываем оценку.
            if (data?.duration != null) {
                setShowRating(true);
                return;
            }

            // Во всех остальных причинах (таймаут/лимит/не найден и т.д.) — выходим из чата,
            // чтобы пользователь не застревал в "пустом" интерфейсе.
            setTimeout(() => {
                router.push(localePath('/tree'));
            }, 100);
        });

        socket.on('chat_closed', (data) => {
            console.log('Chat closed due to complaint:', data);
            clearActiveChat();
            setTimeout(() => {
                router.push(localePath('/cabinet/history'));
            }, 1000);
        });

        socket.on('rate_partner', () => {
            setShowRating(true);
        });

        socket.on('partner_rated', () => {
            setShowRating(true);
        });

        // Typing events
        socket.on('partner_typing', () => {
            setIsPartnerTyping(true);
        });

        socket.on('partner_stop_typing', () => {
            setIsPartnerTyping(false);
        });

        // Система ожидания собеседника
        socket.on('partner_disconnected', (data) => {
            const pausedSeconds = readActiveElapsedSeconds(data?.activeElapsedSeconds);
            if (pausedSeconds != null) {
                pausedActiveDurationRef.current = pausedSeconds;
                setActiveDurationSeconds(pausedSeconds);
            } else if (pausedActiveDurationRef.current == null) {
                pausedActiveDurationRef.current = computeActiveDurationSeconds();
                setActiveDurationSeconds(pausedActiveDurationRef.current);
            }
            setIsWaitingForPartner(true);
            setWaitingTimeLeft(data?.timeLeft ?? 60);
            const fallbackKey = data?.strictMode === false ? 'chat.partner_connection_lost_soft' : 'chat.partner_connection_lost_wait';
            const translatedMessage = data?.messageKey ? t(String(data.messageKey)) : '';
            setWaitingMessage(translatedMessage || data?.message || t(fallbackKey));
            setDisconnectCount(data?.disconnectCount ?? 0);
            setMaxDisconnects(data?.maxDisconnects ?? 2);
        });

        socket.on('partner_reconnected', (data) => {
            const nextStartedAt = readSocketDate(data?.startedAt);
            if (nextStartedAt) {
                setStartedAt(nextStartedAt);
            }
            pausedActiveDurationRef.current = null;
            setIsWaitingForPartner(false);
            setWaitingMessage('');
            setWaitingTimeLeft(60);
            fetchMessages();
        });

        socket.on('chat_resumed', (data) => {
            const nextStartedAt = readSocketDate(data?.startedAt);
            if (nextStartedAt) {
                setStartedAt(nextStartedAt);
            }
            pausedActiveDurationRef.current = null;
            setIsWaitingForPartner(false);
            setWaitingMessage('');
            setWaitingTimeLeft(60);
            fetchMessages();
        });

        setIsConnecting(false);

        return () => {
            socket.off('new_message');
            socket.off('partner_left_early');
            socket.off('chat_ended');
            socket.off('chat_closed');
            socket.off('rate_partner');
            socket.off('partner_rated');
            socket.off('partner_typing');
            socket.off('partner_stop_typing');
            socket.off('partner_disconnected');
            socket.off('partner_reconnected');
            socket.off('chat_resumed');
        };
    }, [socket, chatId, user, clearActiveChat, router, fetchMessages, playIncomingMessageSound, touchChatActivity, computeActiveDurationSeconds, localePath, t]);

    useEffect(() => {
        if (!socket || !chatId || !user) return;

        const clearHeartbeatTimeout = () => {
            if (heartbeatTimeoutRef.current != null) {
                window.clearTimeout(heartbeatTimeoutRef.current);
                heartbeatTimeoutRef.current = null;
            }
        };

        const getHeartbeatState = (now: number) => {
            void now;
            const strictMode = activeDurationSecondsRef.current * 1000 < CHAT_STRICT_PHASE_MS;
            const heartbeatIntervalMs = strictMode ? CHAT_STRICT_HEARTBEAT_MS : CHAT_RELAXED_HEARTBEAT_MS;
            return { strictMode, heartbeatIntervalMs };
        };

        const scheduleHeartbeat = (delayMs: number) => {
            clearHeartbeatTimeout();
            heartbeatTimeoutRef.current = window.setTimeout(() => {
                maybeHeartbeat();
            }, Math.max(250, delayMs));
        };

        const maybeHeartbeat = () => {
            clearHeartbeatTimeout();

            const now = Date.now();
            if (document.hidden || isWaitingForPartner) {
                return;
            }

            const { strictMode, heartbeatIntervalMs } = getHeartbeatState(now);
            const idleForMs = now - lastLocalActivityAtRef.current;
            const timeUntilDue = Math.max(0, heartbeatIntervalMs - (now - chatHeartbeatSentAtRef.current));

            if (!strictMode && idleForMs > CHAT_HEARTBEAT_ACTIVITY_GRACE_MS) {
                return;
            }

            if (timeUntilDue <= 250) {
                socket.emit('chat_heartbeat', { chatId: chatId.toString() });
                chatHeartbeatSentAtRef.current = now;
                scheduleHeartbeat(heartbeatIntervalMs);
                return;
            }

            scheduleHeartbeat(timeUntilDue);
        };

        const markActivity = () => {
            touchChatActivity();
            maybeHeartbeat();
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                clearHeartbeatTimeout();
                return;
            }
            maybeHeartbeat();
        };

        window.addEventListener('pointerdown', markActivity, true);
        window.addEventListener('touchstart', markActivity, true);
        window.addEventListener('keydown', markActivity, true);
        window.addEventListener('focus', markActivity);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        maybeHeartbeat();

        return () => {
            clearHeartbeatTimeout();
            window.removeEventListener('pointerdown', markActivity, true);
            window.removeEventListener('touchstart', markActivity, true);
            window.removeEventListener('keydown', markActivity, true);
            window.removeEventListener('focus', markActivity);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [socket, chatId, isWaitingForPartner, user, touchChatActivity]);

    // Таймер обратного отсчета для ожидания
    useEffect(() => {
        if (!isWaitingForPartner || waitingTimeLeft <= 0) return;
        
        const timer = setInterval(() => {
            setWaitingTimeLeft(prev => {
                if (prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(timer);
    }, [isWaitingForPartner, waitingTimeLeft]);

    const handleSendMessage = (text: string) => {
        if (!socket || !chatId) return;
        touchChatActivity();
        socket.emit('send_message', { chatId, text });
    };

    const handleTyping = useCallback(() => {
        if (!socket || !chatId) return;
        touchChatActivity();
        socket.emit('typing', { chatId });
    }, [socket, chatId, touchChatActivity]);

    const handleStopTyping = useCallback(() => {
        if (!socket || !chatId) return;
        socket.emit('stop_typing', { chatId });
    }, [socket, chatId]);

    const handleLeave = () => {
        if (!socket || !chatId) return;
        const reportedTotalDurationSeconds = Math.max(0, Math.floor(activeDurationSeconds));

        if (isFriend) {
            socket.emit('leave_chat', { chatId: chatId.toString(), reportedTotalDurationSeconds });
            return;
        }

        if (isWaitingForPartner) {
            setShowLeaveWarning(true);
            setLeaveWarningChatId(chatId.toString());
            return;
        }

        const durationSeconds = activeDurationSeconds;
        setLeaveConfirmIsEarly(durationSeconds < 300 && !isFriend);
        setLeaveConfirmChatId(chatId.toString());
        setShowLeaveConfirm(true);
    };

    const handleConfirmLeaveWaiting = () => {
        if (!socket || !leaveWarningChatId) return;
        const reportedTotalDurationSeconds = Math.max(0, Math.floor(activeDurationSeconds));
        socket.emit('leave_chat', { chatId: leaveWarningChatId, reportedTotalDurationSeconds });
        setShowLeaveWarning(false);
        setLeaveWarningChatId(null);
    };

    const handleCancelLeaveWaiting = () => {
        setShowLeaveWarning(false);
        setLeaveWarningChatId(null);
    };

    const handleConfirmLeave = () => {
        if (!socket || !leaveConfirmChatId) return;
        const reportedTotalDurationSeconds = Math.max(0, Math.floor(activeDurationSeconds));
        socket.emit('leave_chat', { chatId: leaveConfirmChatId, reportedTotalDurationSeconds });
        setShowLeaveConfirm(false);
        setLeaveConfirmChatId(null);
    };

    const handleCancelLeave = () => {
        setShowLeaveConfirm(false);
        setLeaveConfirmChatId(null);
    };

    const handleRate = (liked: boolean) => {
        if (!socket || !chatId) return;
        socket.emit('rate_partner', { chatId, rating: liked });
        clearActiveChat();
        setTimeout(() => {
            router.push(localePath('/tree'));
        }, 100);
    };

    const handleComplaint = async () => {
        try {
            await refreshUser();
        } catch {
            // ignore
        }
        setShowComplaint(true);
    };

    const submitComplaint = async (reason: string) => {
        if (!chatId) return;

        try {
            const reportedTotalDurationSeconds = Math.max(0, Math.floor(activeDurationSeconds));
            const data = await apiPost<{
                success: boolean;
                message: string;
                appealId: string;
                remainingChips: number;
            }>(`/chats/${chatId}/complaint`, { reason, reportedTotalDurationSeconds });

            if (user) {
                updateUser({ ...user, complaintChips: data.remainingChips });
            }

            setShowComplaint(false);
            clearActiveChat();
            toast.success(t('chat.complaint_submitted'), `${t('chat.chips_left')} ${data.remainingChips}`);
            router.push(localePath('/cabinet/history'));
        } catch (error: unknown) {
            console.error('Error submitting complaint:', error);
            const message = error instanceof Error ? error.message : '';
            toast.error(t('common.error'), message || t('chat.complaint_submit_failed'));
            setShowComplaint(false);
        }
    };

    const [partnerId, setPartnerId] = useState<string | null>(null);
    const [partnerName, setPartnerName] = useState<string>(t('chat.partner_default_name'));
    const [relationship, setRelationship] = useState<Relationship | null>(null);
    const isFriend = Boolean(relationship?.isFriend);
    const canSendFriendRequest = Boolean(relationship?.canSendFriendRequest);

    const fetchChatDetails = useCallback(async () => {
        if (!chatId || !user) return;
        try {
            const chat = await apiGet<unknown>(`/chats/${chatId}`);
            if (typeof chat === 'object' && chat !== null && 'participants' in chat) {
                const participants = (chat as { participants?: unknown }).participants;
                const startedAtValue = (chat as { startedAt?: unknown }).startedAt;
                const waitingStateRaw = (chat as { waitingState?: unknown }).waitingState;
                const disconnectionCountRaw = (chat as { disconnectionCount?: unknown }).disconnectionCount;
                const relationshipRaw = (chat as { relationship?: unknown }).relationship;
                const list = Array.isArray(participants) ? participants : [];
                const partner = list
                    .map((p) => extractParticipant(p))
                    .find((p) => p && p.id !== user._id);
                if (partner) {
                    setPartnerId(partner.id);
                    setPartnerName(partner.nickname || t('chat.partner_default_name'));
                }
                const parsedStartedAt = readSocketDate(startedAtValue);
                const nextStartedAt = parsedStartedAt || new Date();
                if (parsedStartedAt) {
                    setStartedAt(parsedStartedAt);
                }

                const waitingState = typeof waitingStateRaw === 'object' && waitingStateRaw !== null
                    ? waitingStateRaw as Record<string, unknown>
                    : null;
                const disconnectedId = String(waitingState?.disconnectedUserId || '');
                if (waitingState?.isWaiting === true && disconnectedId && disconnectedId !== user._id) {
                    const waitingSince = readSocketDate(waitingState.waitingSince);
                    const activeSeconds = readActiveElapsedSeconds(waitingState.activeElapsedSeconds)
                        ?? (waitingSince ? Math.max(0, Math.floor((waitingSince.getTime() - nextStartedAt.getTime()) / 1000)) : null);
                    if (activeSeconds != null) {
                        pausedActiveDurationRef.current = activeSeconds;
                        setActiveDurationSeconds(activeSeconds);
                    }
                    const waitingElapsed = waitingSince ? Math.max(0, Math.floor((Date.now() - waitingSince.getTime()) / 1000)) : 0;
                    setIsWaitingForPartner(true);
                    setWaitingTimeLeft(Math.max(0, 60 - waitingElapsed));
                    setWaitingMessage(t('chat.partner_connection_lost_wait'));
                    const disconnectionCount = typeof disconnectionCountRaw === 'object' && disconnectionCountRaw !== null
                        ? disconnectionCountRaw as Record<string, unknown>
                        : {};
                    setDisconnectCount(Math.max(0, Number(disconnectionCount[disconnectedId]) || 0));
                    setMaxDisconnects(3);
                } else if (waitingState?.isWaiting !== true) {
                    setIsWaitingForPartner(false);
                    setWaitingMessage('');
                    setWaitingTimeLeft(60);
                    pausedActiveDurationRef.current = null;
                }

                if (relationshipRaw && typeof relationshipRaw === 'object') {
                    const rel = relationshipRaw as Partial<Relationship>;
                    setRelationship({
                        isFriend: Boolean(rel.isFriend),
                        hasOutgoingFriendRequest: Boolean(rel.hasOutgoingFriendRequest),
                        hasIncomingFriendRequest: Boolean(rel.hasIncomingFriendRequest),
                        canSendFriendRequest: Boolean(rel.canSendFriendRequest),
                    });
                } else {
                    setRelationship(null);
                }
            }
        } catch (error) {
            console.error('Error fetching chat details:', error);
        }
    }, [chatId, user, t]);

    useEffect(() => {
        if (!socket) return;
        const handleFriendsUpdated = () => {
            fetchChatDetails();
        };
        socket.on('friends_updated', handleFriendsUpdated);
        return () => {
            socket.off('friends_updated', handleFriendsUpdated);
        };
    }, [socket, fetchChatDetails]);

    useEffect(() => {
        fetchChatDetails();
        fetchMessages();
    }, [fetchChatDetails, fetchMessages]);

    const handleAddFriend = async () => {
        if (!partnerId) return;
        try {
            const data = await apiPost<{ status?: string; message?: string }>('/match/friends/request', { friendId: partnerId });
            setRelationship((prev) => ({
                ...(prev || {
                    isFriend: false,
                    hasOutgoingFriendRequest: false,
                    hasIncomingFriendRequest: false,
                    canSendFriendRequest: false,
                }),
                isFriend: false,
                hasOutgoingFriendRequest: true,
                hasIncomingFriendRequest: false,
                canSendFriendRequest: false,
            }));
            toast.success(
                data?.status === 'pending_acceptance' ? t('chat.friend_request_pending') : t('chat.friend_request_sent'),
                data?.status === 'pending_acceptance' ? t('chat.friend_request_pending_hint') : t('chat.friend_request_wait_confirm')
            );
            fetchChatDetails();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '';
            const alreadySentNeedle = t('gen.s227');
            if (alreadySentNeedle && message.toLowerCase().includes(alreadySentNeedle.toLowerCase())) {
                setRelationship((prev) => ({
                    ...(prev || {
                        isFriend: false,
                        hasOutgoingFriendRequest: false,
                        hasIncomingFriendRequest: false,
                        canSendFriendRequest: false,
                    }),
                    isFriend: false,
                    hasOutgoingFriendRequest: true,
                    hasIncomingFriendRequest: false,
                    canSendFriendRequest: false,
                }));
            }
            toast.error(t('common.error'), message || t('chat.friend_request_send_error'));
        }
    };

    if (!user || isConnecting) {
        return <div className="flex items-center justify-center h-screen bg-black text-white">{t('common.connecting')}</div>;
    }

    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
    const isDesktop = Boolean(sideAdSlot);
    const isSmallHeight = windowHeight < 700;

    return (
        <div className="relative h-[100dvh] w-full bg-black overflow-hidden flex flex-col">
            {/* Background Animation */}
            <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                transition={{ duration: 0.8, ease: 'circOut' }}
                className="absolute inset-y-0 left-0 w-1/2 bg-gray-900 z-0"
            />
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                transition={{ duration: 0.8, ease: 'circOut' }}
                className="absolute inset-y-0 right-0 w-1/2 bg-gray-900 z-0"
            />

            {/* Header */}
            <div className="relative z-20 shrink-0">
                <Header />
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex-1 min-h-0 flex">
                {/* Left Ad Sidebar - Desktop only */}
                {isDesktop && (
                    <StickySideAdRail adSlot={sideAdSlot} page="chat" placement="chat_sidebar_left" />
                )}

                {/* Center - Chat */}
                <div className={`flex-1 flex flex-col min-w-0 ${isSmallHeight ? 'px-1 py-1' : 'px-2 md:px-4 py-2'}`}>
                    {/* Mobile/Tablet Ad - Top (показывается когда нет сайдбаров) */}
                    {!isDesktop && (
                        <div className={`flex justify-center shrink-0 w-full ${isSmallHeight ? 'mb-3' : 'mb-4'}`}>
                            <AdaptiveAdWrapper
                                page="chat"
                                placement="chat_header"
                                strategy="chat_adaptive"
                            />
                        </div>
                    )}

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.8, duration: 0.5 }}
                        className="flex-1 min-h-0"
                    >
                        <ChatWindow
                            messages={messages}
                            startedAt={startedAt}
                            activeDurationSeconds={activeDurationSeconds}
                            onSendMessage={handleSendMessage}
                            onLeave={handleLeave}
                            onComplaint={handleComplaint}
                            onAddFriend={canSendFriendRequest ? handleAddFriend : undefined}
                            canAddFriend={canSendFriendRequest}
                            onTyping={handleTyping}
                            onStopTyping={handleStopTyping}
                            partnerName={partnerName}
                            isPartnerTyping={isPartnerTyping}
                            isCompact={isSmallHeight}
                            isWaitingForPartner={isWaitingForPartner}
                            waitingTimeLeft={waitingTimeLeft}
                            waitingMessage={waitingMessage}
                            disconnectCount={disconnectCount}
                            maxDisconnects={maxDisconnects}
                        />
                    </motion.div>
                </div>

                {/* Right Ad Sidebar - Desktop only */}
                {isDesktop && (
                    <StickySideAdRail adSlot={sideAdSlot} page="chat" placement="chat_sidebar_right" />
                )}
            </div>

            <RatingModal isOpen={showRating} onRate={handleRate} />
            <ComplaintModal
                isOpen={showComplaint}
                onClose={() => setShowComplaint(false)}
                onSubmit={submitComplaint}
                chipsRemaining={user?.complaintChips ?? 0}
                chipsMax={15}
            />

            {/* Подтверждение выхода из чата */}
            {showLeaveConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className={`bg-gray-900 border ${leaveConfirmIsEarly ? 'border-red-500/50' : 'border-white/10'} rounded-2xl p-6 max-w-md w-full shadow-2xl`}>
                        <div className="text-center">
                            <div className={`w-16 h-16 ${leaveConfirmIsEarly ? 'bg-red-500/20' : 'bg-white/5'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                                <svg className={`w-8 h-8 ${leaveConfirmIsEarly ? 'text-red-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">
                                {leaveConfirmIsEarly ? t('chat.leave_early') : t('chat.leave_chat_q')}
                            </h3>
                            <p className="text-gray-300 mb-6">
                                {leaveConfirmIsEarly
                                    ? t('chat.leave_early_penalty')
                                    : t('chat.sure_leave')}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCancelLeave}
                                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    {t('common.stay')}
                                </button>
                                <button
                                    onClick={handleConfirmLeave}
                                    className={`flex-1 px-4 py-2 ${leaveConfirmIsEarly ? 'bg-red-600 hover:bg-red-500' : 'bg-purple-600 hover:bg-purple-500'} text-white rounded-lg transition-colors`}
                                >
                                    {t('common.leave')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Модальное окно предупреждения о выходе из ожидания */}
            {showLeaveWarning && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-red-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{t('common.warning')}</h3>
                            <p className="text-gray-300 mb-6">{t('chat.leave_waiting_penalty')}</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCancelLeaveWaiting}
                                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    {t('common.stay')}
                                </button>
                                <button
                                    onClick={handleConfirmLeaveWaiting}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                                >
                                    {t('common.leave')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
