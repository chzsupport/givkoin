'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const { language } = useI18n();
    const [socket, setSocket] = useState<Socket | null>(null);
    const userId = user?._id;
    const logoutRef = useRef(logout);

    useEffect(() => {
        logoutRef.current = logout;
    }, [logout]);

    useEffect(() => {
        if (!userId) {
            setSocket((prev) => {
                if (prev) prev.disconnect();
                return null;
            });
            return;
        }

        const socketInstance = io(API_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            timeout: 5000,
            withCredentials: true,
            auth: {
                siteLanguage: language,
            },
        });

        socketInstance.on('connect', () => {
            socketInstance.emit('auth', { siteLanguage: language });
            socketInstance.emit('site_language', { language });
        });
        socketInstance.on('auth:force_logout', () => {
            socketInstance.disconnect();
            logoutRef.current();
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.off('auth:force_logout');
            socketInstance.disconnect();
            setSocket((prev) => (prev === socketInstance ? null : prev));
        };
    }, [language, userId]);

    useEffect(() => {
        if (!socket) return;
        socket.emit('site_language', { language });
    }, [language, socket]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocketContext() {
    return useContext(SocketContext);
}
