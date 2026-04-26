import React, { useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatTimer } from './ChatTimer';
import { Send, X } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { formatTime } from '@/utils/formatters';

interface Message {
    _id: string;
    text: string;
    translatedText?: string;
    isMine: boolean;
    createdAt: string;
    status?: 'sent' | 'delivered' | 'read';
}

interface ChatWindowProps {
    messages: Message[];
    startedAt: Date;
    onSendMessage: (text: string) => void;
    onLeave: () => void;
    onComplaint: () => void;
    onAddFriend?: () => void;
    canAddFriend?: boolean;
    onTyping?: () => void;
    onStopTyping?: () => void;
    partnerName?: string;
    isPartnerTyping?: boolean;
    isCompact?: boolean;
    // Система ожидания
    isWaitingForPartner?: boolean;
    waitingTimeLeft?: number;
    waitingMessage?: string;
    disconnectCount?: number;
    maxDisconnects?: number;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    startedAt,
    onSendMessage,
    onLeave,
    onComplaint,
    onAddFriend,
    canAddFriend = true,
    onTyping,
    onStopTyping,
    partnerName,
    isPartnerTyping = false,
    isCompact = false,
    isWaitingForPartner = false,
    waitingTimeLeft = 60,
    waitingMessage = '',
    disconnectCount = 0,
    maxDisconnects = 2
}) => {
    const { language, t } = useI18n();
    const [inputText, setInputText] = React.useState('');
    const messagesViewportRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingKeepAliveRef = useRef<NodeJS.Timeout | null>(null);
    const isTypingActiveRef = useRef(false);
    const lastTypedAtRef = useRef(0);
    const shouldStickToBottomRef = useRef(true);
    const previousMessageCountRef = useRef(0);
    const initializedScrollRef = useRef(false);

    const isNearBottom = useCallback(() => {
        const viewport = messagesViewportRef.current;
        if (!viewport) return true;
        const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        return distanceToBottom <= 96;
    }, []);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    const handleMessagesScroll = useCallback(() => {
        shouldStickToBottomRef.current = isNearBottom();
    }, [isNearBottom]);

    useEffect(() => {
        if (initializedScrollRef.current) return;
        initializedScrollRef.current = true;
        scrollToBottom('auto');
        previousMessageCountRef.current = messages.length;
        shouldStickToBottomRef.current = true;
    }, [messages.length, scrollToBottom]);

    useEffect(() => {
        const hasNewMessage = messages.length > previousMessageCountRef.current;
        if (shouldStickToBottomRef.current) {
            scrollToBottom(hasNewMessage ? 'smooth' : 'auto');
        }
        previousMessageCountRef.current = messages.length;
        if (!isPartnerTyping) {
            shouldStickToBottomRef.current = isNearBottom();
        }
    }, [messages, isPartnerTyping, isNearBottom, scrollToBottom]);

    useEffect(() => {
        const viewport = messagesViewportRef.current;
        if (!viewport) return;
        shouldStickToBottomRef.current = isNearBottom();
        viewport.addEventListener('scroll', handleMessagesScroll, { passive: true });
        return () => {
            viewport.removeEventListener('scroll', handleMessagesScroll);
        };
    }, [handleMessagesScroll, isNearBottom]);

    const [showAddFriend, setShowAddFriend] = React.useState(false);

    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            const start = new Date(startedAt);
            const diff = (now.getTime() - start.getTime()) / 1000 / 60; // minutes
            if (diff >= 5) {
                setShowAddFriend(true);
            }
        };

        checkTime();
        const interval = setInterval(checkTime, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, [startedAt]);

    useEffect(() => {
        return () => {
            if (typingKeepAliveRef.current) {
                clearInterval(typingKeepAliveRef.current);
                typingKeepAliveRef.current = null;
            }
        };
    }, []);

    const stopTypingSignal = useCallback(() => {
        if (typingKeepAliveRef.current) {
            clearInterval(typingKeepAliveRef.current);
            typingKeepAliveRef.current = null;
        }
        if (isTypingActiveRef.current && onStopTyping) {
            onStopTyping();
        }
        isTypingActiveRef.current = false;
    }, [onStopTyping]);

    const ensureTypingSignal = useCallback(() => {
        if (!onTyping) return;
        if (!isTypingActiveRef.current) {
            onTyping();
            isTypingActiveRef.current = true;
        }
        if (!typingKeepAliveRef.current) {
            typingKeepAliveRef.current = setInterval(() => {
                if (!isTypingActiveRef.current) return;
                if (Date.now() - lastTypedAtRef.current > 10000) {
                    stopTypingSignal();
                    return;
                }
                onTyping();
            }, 10000);
        }
    }, [onTyping, stopTypingSignal]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value;
        setInputText(nextValue);

        if (nextValue.length > 0) {
            lastTypedAtRef.current = Date.now();
            ensureTypingSignal();
        } else {
            stopTypingSignal();
        }
    }, [ensureTypingSignal, stopTypingSignal]);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim()) return;

        stopTypingSignal();
        shouldStickToBottomRef.current = true;

        onSendMessage(inputText);
        setInputText('');
    };

    const partnerLabel = partnerName || t('chat.partner_default_name');

    return (
        <div className="flex flex-col h-full bg-gray-900/50 backdrop-blur-md rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            {/* Header - новый макет */}
            <div className={`flex items-center justify-between ${isCompact ? 'px-2 py-2' : 'px-4 py-3'} bg-black/40 border-b border-white/5`}>
                {/* Левая часть - кнопка Пожаловаться */}
                <button
                    onClick={onComplaint}
                    className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors rounded-lg border border-red-500/30"
                >
                    {isCompact ? t('chat.complaint') : t('chat.complain_action')}
                </button>

                {/* Центр - таймер и никнейм */}
                <div className="flex items-center gap-3">
                    <ChatTimer startedAt={startedAt} />
                    <div className="w-px h-4 bg-white/20" />
                    <span className="text-white font-medium text-sm">{partnerLabel}</span>
                </div>

                {/* Правая часть - крестик */}
                <button
                    onClick={onLeave}
                    className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                    title={t('chat.leave_chat')}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Кнопка добавить в друзья - под header */}
            {showAddFriend && onAddFriend && canAddFriend && (
                <div className={`${isCompact ? 'px-2 py-1' : 'px-4 py-2'} bg-black/20 border-b border-white/5`}>
                    <button
                        onClick={onAddFriend}
                        className={`w-full flex items-center justify-center gap-2 ${isCompact ? 'px-2 py-1.5' : 'px-4 py-2'} rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors text-xs font-medium border border-emerald-500/30`}
                    >
                        <span>+</span>
                        {t('chat.add_friend_button')}
                    </button>
                </div>
            )}

            {/* Уведомление об ожидании собеседника */}
            {isWaitingForPartner && (
                <div className={`${isCompact ? 'px-2 py-2' : 'px-4 py-3'} bg-amber-500/10 border-b border-amber-500/30`}>
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center animate-pulse">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-amber-300 font-medium ${isCompact ? 'text-xs' : 'text-sm'}`}>
                                {waitingMessage}
                            </p>
                            <p className={`text-amber-400/70 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                                {waitingTimeLeft > 0 ? (
                                    <>
                                        {t('chat.wait_left')}: <span className="font-bold">{waitingTimeLeft}</span> {t('chat.seconds_short')}
                                        {disconnectCount > 0 && maxDisconnects > 0 && ` (${disconnectCount}/${maxDisconnects} ${t('chat.disconnects')})`}
                                    </>
                                ) : (
                                    <>{t('chat.wait_manual_end')}</>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages Area */}
            <div
                ref={messagesViewportRef}
                className={`flex-1 overflow-y-auto ${isCompact ? 'p-2 space-y-2' : 'p-4 space-y-4'} scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent`}
            >
                {messages.map((msg) => (
                    <MessageBubble
                        key={msg._id}
                        text={msg.text}
                        translatedText={msg.translatedText}
                        isMine={msg.isMine}
                        time={formatTime(msg.createdAt, language, { hour: '2-digit', minute: '2-digit' })}
                        status={msg.status}
                    />
                ))}

                {/* Индикатор печатания */}
                {isPartnerTyping && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <div className="flex gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span>{partnerLabel} {t('chat.typing_suffix')}</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className={`${isCompact ? 'p-2' : 'p-4'} bg-black/40 border-t border-white/5`}>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputText}
                        onChange={handleInputChange}
                        onFocus={() => {
                            if (inputText.trim()) ensureTypingSignal();
                        }}
                        placeholder={t('chat.message_placeholder')}
                        className={`flex-1 bg-gray-800/50 text-white placeholder-gray-500 rounded-xl ${isCompact ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-body'} focus:outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/5`}
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className={`bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white ${isCompact ? 'p-2' : 'p-3'} rounded-xl transition-colors`}
                    >
                        <Send size={isCompact ? 16 : 20} />
                    </button>
                </div>
            </form>
        </div>
    );
};
