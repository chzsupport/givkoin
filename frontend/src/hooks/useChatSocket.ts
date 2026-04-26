import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';

export type ChatMessage = {
    localId?: string;
    messageId?: string;
    chatId: string;
    senderId: string;
    content: string;
    language?: string;
    sentAt?: string;
    status: 'sending' | 'sent' | 'error';
};

type SendPayload = {
    chatId: string;
    senderId: string;
    content: string;
    language?: string;
};

export function useChatSocket(chatId: string, userId: string) {
    const socket = useSocket(userId);
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    // Join room when socket ready and chatId present
    useEffect(() => {
        if (!socket || !chatId || !userId) {
            setConnected(false);
            return;
        }

        const joinChat = () => {
            socket.emit('chat:join', { chatId, userId });
        };

        const onConnect = () => {
            setConnected(true);
            joinChat();
        };

        const onDisconnect = () => setConnected(false);

        const onMessage = (payload: unknown) => {
            const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
            if (!isObject(payload)) return;
            const {
                chatId: incomingChatId,
                senderId: incomingSender,
                content,
                language,
                messageId,
                sentAt,
                status,
            } = payload;
            if (!incomingChatId || !content) return;
            setMessages((prev) => {
                // dedupe by messageId if already present
                if (typeof messageId === 'string' && prev.some((m) => m.messageId === messageId)) return prev;
                if (typeof incomingChatId !== 'string') return prev;
                if (typeof incomingSender !== 'string') return prev;
                if (typeof content !== 'string') return prev;
                return [
                    ...prev,
                    {
                        chatId: incomingChatId,
                        senderId: incomingSender,
                        content,
                        language: typeof language === 'string' ? language : undefined,
                        messageId: typeof messageId === 'string' ? messageId : undefined,
                        sentAt: typeof sentAt === 'string' ? sentAt : undefined,
                        status: status === 'sending' || status === 'sent' || status === 'error' ? status : 'sent',
                    },
                ];
            });
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('chat:message', onMessage);

        if (socket.connected) {
            setConnected(true);
            joinChat();
        } else {
            setConnected(false);
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('chat:message', onMessage);
        };
    }, [socket, chatId, userId]);

    const sendMessage = (payload: SendPayload) => {
        if (!socket || !payload.content.trim()) return;
        const localId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const baseMessage: ChatMessage = {
            localId,
            chatId: payload.chatId,
            senderId: payload.senderId,
            content: payload.content,
            language: payload.language,
            status: 'sending',
        };
        setMessages((prev) => [...prev, baseMessage]);

        socket.emit('chat:message', payload, (resp: unknown) => {
            setMessages((prev) =>
                prev.map((m) => {
                    if (m.localId !== localId) return m;
                    const ok = typeof resp === 'object' && resp !== null && 'ok' in resp && (resp as { ok?: unknown }).ok === true;
                    if (!ok) {
                        return { ...m, status: 'error' };
                    }
                    return {
                        ...m,
                        status: 'sent',
                        messageId:
                            typeof resp === 'object' && resp !== null && 'messageId' in resp
                                ? String((resp as { messageId?: unknown }).messageId)
                                : undefined,
                        sentAt: new Date().toISOString(),
                    };
                }),
            );
        });
    };

    return { socket, connected, messages, sendMessage };
}
