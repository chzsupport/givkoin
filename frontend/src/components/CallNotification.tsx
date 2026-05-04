'use client';

import React, { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { IncomingCallModal } from './chat/IncomingCallModal';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';

type IncomingCallState = {
    callerId: string;
    callerName?: string;
    source: 'random' | 'friend';
};

export function CallNotification() {
    const { user } = useAuth();
    const toast = useToast();
    const socket = useSocket(user?._id);
    const router = useRouter();
    const { t, localePath } = useI18n();
    const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
    const [preparingChat, setPreparingChat] = useState<{ chatId: string; readyAt?: string | null; countdownSeconds: number } | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!preparingChat) {
            setTimeLeft(0);
            return;
        }

        const tick = () => {
            if (preparingChat.readyAt) {
                const diffSeconds = Math.max(0, Math.ceil((new Date(preparingChat.readyAt).getTime() - Date.now()) / 1000));
                setTimeLeft(diffSeconds);
                return;
            }
            setTimeLeft((prev) => Math.max(0, prev - 1));
        };

        setTimeLeft(Math.max(0, Number(preparingChat.countdownSeconds) || 0));
        tick();
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [preparingChat]);

    useEffect(() => {
        if (!socket) return;

        const resolveSocketMessage = (data: { message?: string; messageKey?: string } | null | undefined, fallbackKey: string) => {
            const translated = data?.messageKey ? t(data.messageKey) : '';
            return translated || data?.message || t(fallbackKey);
        };

        const handleFriendInvite = (data: { inviterId: string; inviterName: string }) => {
            setIncomingCall({
                callerId: data.inviterId,
                callerName: data.inviterName,
                source: 'friend',
            });
        };

        const handleIncomingCall = (data: { callerId: string; source?: 'friend' | 'random'; callerName?: string }) => {
            setIncomingCall({
                callerId: data.callerId,
                callerName: data.callerName,
                source: data.source === 'friend' ? 'friend' : 'random',
            });
        };

        const handleCallTimeout = () => {
            setIncomingCall(null);
        };

        const handleInviteDeclined = (data: { message?: string; messageKey?: string }) => {
            toast.error(t('chat.call_declined'), resolveSocketMessage(data, 'chat.invite_declined'));
        };

        const handleChatPreparing = ({ chatId, readyAt, countdownSeconds }: { chatId: string; readyAt?: string; countdownSeconds?: number }) => {
            if (!chatId) return;
            setIncomingCall(null);
            setPreparingChat({
                chatId,
                readyAt: readyAt || null,
                countdownSeconds: Math.max(0, Number(countdownSeconds) || 0),
            });
        };

        const handlePartnerFound = ({ chatId }: { chatId: string }) => {
            setIncomingCall(null);
            setPreparingChat(null);
            router.push(localePath(`/chat/${chatId}`));
        };

        socket.on('friend_invite', handleFriendInvite);
        socket.on('incoming_call', handleIncomingCall);
        socket.on('call_timeout', handleCallTimeout);
        socket.on('invite_declined', handleInviteDeclined);
        socket.on('chat_preparing', handleChatPreparing);
        socket.on('partner_found', handlePartnerFound);

        return () => {
            socket.off('friend_invite', handleFriendInvite);
            socket.off('incoming_call', handleIncomingCall);
            socket.off('call_timeout', handleCallTimeout);
            socket.off('invite_declined', handleInviteDeclined);
            socket.off('chat_preparing', handleChatPreparing);
            socket.off('partner_found', handlePartnerFound);
        };
    }, [socket, router, toast, localePath, t]);

    const handleAccept = () => {
        if (!socket || !incomingCall) return;
        if (incomingCall.source === 'friend') {
            socket.emit('friend_invite_response', { inviterId: incomingCall.callerId, accepted: true });
        } else {
            socket.emit('call_response', { accepted: true, callerId: incomingCall.callerId });
        }
        setIncomingCall(null);
    };

    const handleDecline = () => {
        if (!socket || !incomingCall) return;
        if (incomingCall.source === 'friend') {
            socket.emit('friend_invite_response', { inviterId: incomingCall.callerId, accepted: false });
        } else {
            socket.emit('call_response', { accepted: false, callerId: incomingCall.callerId });
        }
        setIncomingCall(null);
    };

    return (
        <>
            <IncomingCallModal
                isOpen={!!incomingCall}
                onAccept={handleAccept}
                onDecline={handleDecline}
                title={incomingCall?.source === 'friend' ? t('chat.incoming_call_friend') : t('chat.incoming_call')}
                subtitle={
                    incomingCall?.source === 'friend'
                        ? `${t('chat.invites_you')} ${incomingCall.callerName || t('chat.friend')}`
                        : t('chat.partner_found')
                }
            />

            {preparingChat && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-[min(92vw,460px)] rounded-[28px] border border-white/15 bg-[#141414]/95 px-6 py-8 text-center text-white shadow-2xl">
                        <div className="text-[22px] font-semibold">{t('chat.partner_found_title')}</div>
                        <div className="mt-3 text-[17px] text-white/90">{t('chat.chat_preparing_wait')} {timeLeft}</div>
                        <div className="mt-6 text-[42px] font-bold tracking-[0.08em]">{timeLeft}</div>
                        <div className="mt-5 text-[15px] text-white/70">{t('chat.have_nice_chat')}</div>
                    </div>
                </div>
            )}
        </>
    );
}
