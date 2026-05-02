'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiGet } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';
import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';

interface ActiveChat {
    _id: string;
    participants: Array<{
        _id: string;
        nickname: string;
        avatarUrl?: string;
    }>;
    status: 'active' | 'ended' | 'complained';
    startedAt: string;
}

interface ActiveChatContextType {
    activeChat: ActiveChat | null;
    isLoading: boolean;
    checkActiveChat: () => Promise<void>;
    clearActiveChat: () => void;
    setActiveChatData: (chat: ActiveChat) => void;
}

const ActiveChatContext = createContext<ActiveChatContextType | undefined>(undefined);

const ACTIVE_CHAT_KEY = 'givkoin_active_chat';
const ACTIVE_CHAT_RECHECK_MS = 15000;

// Функция для проверки наличия токена в cookies
function hasAuthToken(): boolean {
    if (typeof document === 'undefined') return false;
    return document.cookie.split('; ').some(row => row.startsWith('givkoin_session='));
}

// Получить сохранённый активный чат из localStorage
function getSavedActiveChat(): ActiveChat | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const saved = localStorage.getItem(ACTIVE_CHAT_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

// Сохранить активный чат в localStorage
function saveActiveChat(chat: ActiveChat | null) {
    if (typeof localStorage === 'undefined') return;
    if (chat) {
        localStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify(chat));
    } else {
        localStorage.removeItem(ACTIVE_CHAT_KEY);
    }
}

export function ActiveChatProvider({ children }: { children: ReactNode }) {
    // Инициализируем из localStorage для мгновенной проверки
    const [activeChat, setActiveChat] = useState<ActiveChat | null>(() => getSavedActiveChat());
    const [isLoading, setIsLoading] = useState(true);
    const [hasChecked, setHasChecked] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const { localePath } = useI18n();
    const cleanPathname = normalizeSitePath(pathname || '/');
    const lastPathRef = useRef(pathname);
    const lastCheckAtRef = useRef(0);
    const inFlightCheckRef = useRef<Promise<void> | null>(null);

    const runCheckActiveChat = useCallback(async (force: boolean = false) => {
        const now = Date.now();

        if (!force && lastCheckAtRef.current > 0 && now - lastCheckAtRef.current < ACTIVE_CHAT_RECHECK_MS) {
            return;
        }

        if (inFlightCheckRef.current) {
            return inFlightCheckRef.current;
        }

        // Проверяем токен напрямую, не ожидая AuthContext
        if (!hasAuthToken()) {
            setActiveChat(null);
            saveActiveChat(null);
            setIsLoading(false);
            setHasChecked(true);
            lastCheckAtRef.current = now;
            return;
        }

        const request = (async () => {
            try {
                const data = await apiGet<{ activeChat: ActiveChat | null }>('/chats/active');
                setActiveChat(data.activeChat);
                saveActiveChat(data.activeChat);
            } catch (error) {
                console.error('Error checking active chat:', error);
                setActiveChat(null);
                saveActiveChat(null);
            } finally {
                setIsLoading(false);
                setHasChecked(true);
                lastCheckAtRef.current = Date.now();
                inFlightCheckRef.current = null;
            }
        })();

        inFlightCheckRef.current = request;
        return request;
    }, []);

    const checkActiveChat = useCallback(async () => {
        await runCheckActiveChat(true);
    }, [runCheckActiveChat]);

    const clearActiveChat = useCallback(() => {
        setActiveChat(null);
        saveActiveChat(null);
    }, []);

    const setActiveChatData = useCallback((chat: ActiveChat) => {
        setActiveChat(chat);
        saveActiveChat(chat);
    }, []);

    // Проверяем активный чат сразу при монтировании
    useEffect(() => {
        void runCheckActiveChat(true);
    }, [runCheckActiveChat]);

    // Перепроверяем при каждом изменении pathname (навигации)
    useEffect(() => {
        if (pathname !== lastPathRef.current) {
            lastPathRef.current = pathname;

            const activeChatPath = activeChat ? normalizeSitePath(`/chat/${activeChat._id}`) : null;
            if (activeChatPath && cleanPathname === activeChatPath) {
                return;
            }

            // При навигации на другую страницу - перепроверяем
            if (hasChecked && hasAuthToken()) {
                void runCheckActiveChat(false);
            }
        }
    }, [pathname, cleanPathname, hasChecked, activeChat, runCheckActiveChat]);

    // Перенаправление на активный чат при попытке навигации
    useEffect(() => {
        if (!hasChecked || isLoading) return;
        if (!activeChat) return;

        const chatPath = `/chat/${activeChat._id}`;
        const isOnChatPage = pathStartsWith(cleanPathname, '/chat');
        const isOnLandingOrAuth = cleanPathname === '/' || cleanPathname === '/login' || cleanPathname === '/register' ||
            cleanPathname === '/forgot-password' || cleanPathname === '/reset-password' ||
            pathStartsWith(cleanPathname, '/confirm');

        // Не перенаправляем с landing/auth страниц
        if (isOnLandingOrAuth) return;

        // Если есть активный чат и мы не на странице чата - перенаправляем
        if (!isOnChatPage) {
            router.replace(localePath(chatPath));
        }
    }, [activeChat, cleanPathname, hasChecked, isLoading, router, localePath]);

    return (
        <ActiveChatContext.Provider value={{ activeChat, isLoading, checkActiveChat, clearActiveChat, setActiveChatData }}>
            {children}
        </ActiveChatContext.Provider>
    );
}

export function useActiveChat() {
    const context = useContext(ActiveChatContext);
    if (context === undefined) {
        throw new Error('useActiveChat must be used within an ActiveChatProvider');
    }
    return context;
}



