'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { getSiteLanguage } from '@/i18n/siteLanguage';
import { apiGet, apiPost } from '@/utils/api';
import { scheduleUserSessionWarmup } from '@/utils/sessionWarmup';

interface User {
    id: string;
    _id: string;
    email: string;
    nickname: string;
    role?: 'user' | 'admin';
    gender?: 'male' | 'female' | 'other';
    birthDate?: string;
    preferredGender?: 'male' | 'female' | 'any' | 'other';
    preferredAgeFrom?: number;
    preferredAgeTo?: number;
    language?: string;
    lives: number;
    complaintChips: number;
    stars: number;
    starsMilestonesAwarded?: number[];
    sc: number;
    lumens: number;
    treeBranch?: string;
    shopBoosts?: {
        battleDamage?: { pending?: boolean; battleId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
        battleLumensDiscount?: { pending?: boolean; battleId?: string; activatedAt?: string; discountPercent?: number; adBoosted?: boolean };
        weakZoneDamage?: { pending?: boolean; battleId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
        chatSc?: { pending?: boolean; chatId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
        chatK?: { pending?: boolean; chatId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
        solarExtraLmCharges?: number;
        solarExtraLmAmount?: number;
        solarFocusAdBoosted?: boolean;
        referralBlessingUntil?: string;
        referralBlessingPercent?: number;
        referralBlessingAdBoosted?: boolean;
        referralManualBoost?: {
            cycleKey?: string;
            watchedSteps?: number[];
            completed?: boolean;
            percent?: number;
            completedAt?: string | null;
            activeUntil?: string | null;
        };
        practiceTreeBlessingUntil?: string;
        practiceTreeBlessingPercent?: number;
        practiceTreeBlessingAdBoosted?: boolean;
    };
    nightShift?: {
        isServing?: boolean;
    };
    spinsToday?: number;
    ticketsToday?: number;
    luckyDayAvailable?: boolean;
    newsCard?: {
        dateKey: string;
        likesPerPost: number;
        commentsPerPost: number;
        repostsPerPost: number;
        dailyLikesLimit: number;
        dailyCommentsLimit: number;
        dailyRepostsLimit: number;
        dailyLikesUsed: number;
        dailyCommentsUsed: number;
        dailyRepostsUsed: number;
        dailyLikesLeft: number;
        dailyCommentsLeft: number;
        dailyRepostsLeft: number;
        likedPostIds?: string[];
        repostedPostIds?: string[];
        viewedPostIds?: string[];
        lastReadPostId?: string | null;
    } | null;
    entity?: {
        _id: string;
        name: string;
        avatarUrl: string;
        mood: string;
        createdAt: string;
        satietyUntil?: string;
        history?: {
            message: string;
            createdAt: string;
        }[];
    };
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    login: (userData: User) => void;
    logout: () => void;
    updateUser: (userData: User) => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_EVENT_KEY = 'givkoin_auth_event';
const SESSION_MARKER_COOKIE = 'givkoin_session';

function clearSessionMarker() {
    if (typeof document === 'undefined') return;
    document.cookie = `${SESSION_MARKER_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function setSessionMarker() {
    if (typeof document === 'undefined') return;
    document.cookie = `${SESSION_MARKER_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
}

function hasSessionMarker(): boolean {
    if (typeof document === 'undefined') return false;
    return document.cookie
        .split('; ')
        .some((row) => row.startsWith(`${SESSION_MARKER_COOKIE}=`));
}

function isAuthErrorMessage(message: string): boolean {
    const m = String(message || '').toLowerCase();
    if (!m) return false;
    return (
        m.includes('требуется авторизация') ||
        m.includes('authorization required') ||
        m.includes('unauthorized') ||
        m.includes('not authorized') ||
        m.includes('недействительный токен') ||
        m.includes('invalid token') ||
        m.includes('token is invalid') ||
        m.includes('token invalid') ||
        m.includes('сессия завершена') ||
        m.includes('session expired') ||
        m.includes('all sessions were ended') ||
        m.includes('все сеансы завершены') ||
        m.includes('пользователь не найден') ||
        m.includes('user not found') ||
        m.includes('аккаунт заблокирован')
        || m.includes('account blocked')
    );
}

function isValidStoredUser(value: unknown): value is User {
    const row = value as Record<string, unknown>;
    if (!row || typeof row !== 'object') return false;
    const id = typeof row._id === 'string' ? row._id.trim() : '';
    const email = typeof row.email === 'string' ? row.email.trim() : '';
    const nickname = typeof row.nickname === 'string' ? row.nickname.trim() : '';
    return Boolean(id && email && nickname);
}

function normalizeUserWithIdentity(candidate: unknown, fallback: User | null = null): User | null {
    const row = (candidate && typeof candidate === 'object' ? candidate : {}) as Record<string, unknown>;
    const rowData = (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>;
    
    const nextId = String(row._id || row.id || fallback?._id || '').trim();
    const nextEmail = String(row.email || rowData.email || fallback?.email || '').trim();
    const nextNickname = String(row.nickname || rowData.nickname || fallback?.nickname || '').trim();

    if (!nextId || !nextEmail || !nextNickname) {
        return fallback;
    }

    const merged = {
        ...(fallback || {}),
        ...rowData,
        ...row,
        _id: nextId,
        id: String(row.id || fallback?.id || nextId),
        email: nextEmail,
        nickname: nextNickname,
    } as User;

    if ('data' in merged) {
        const mutable = merged as unknown as { data?: unknown };
        delete mutable.data;
    }

    return merged;
}

function broadcastAuthEvent(type: 'login' | 'logout') {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ type, at: Date.now() }));
    } catch {
        // ignore
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const router = useRouter();

    const resetAuthState = useCallback(() => {
        clearSessionMarker();
        localStorage.removeItem('givkoin_user');
        localStorage.removeItem('givkoin_active_chat');
        setUser(null);
        setIsAuthenticated(false);
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const data = await apiGet<{ user: User }>('/auth/me');
            if (data.user) {
                setUser(data.user);
                localStorage.setItem('givkoin_user', JSON.stringify(data.user));
                scheduleUserSessionWarmup(String(data.user._id || data.user.id || ''));
            }
        } catch (e) {
            console.error("Failed to refresh user data", e);
            const message = e instanceof Error ? e.message : '';
            if (isAuthErrorMessage(message)) {
                resetAuthState();
            }
            throw e;
        }
    }, [resetAuthState]);

    useEffect(() => {
        const initializeAuth = async () => {
            const hasMarker = hasSessionMarker();

            const savedUser = localStorage.getItem('givkoin_user');
            if (savedUser && hasMarker) {
                try {
                    const parsed = JSON.parse(savedUser) as unknown;
                    if (isValidStoredUser(parsed)) {
                        setUser(parsed);
                    } else {
                        localStorage.removeItem('givkoin_user');
                    }
                } catch (e) {
                    console.error("Failed to parse saved user", e);
                    localStorage.removeItem('givkoin_user');
                }
            }

            if (!hasMarker) {
                resetAuthState();
                setIsAuthLoading(false);
                return;
            }

            setIsAuthenticated(true);
            try {
                await refreshUser();
            } catch {
                // refreshUser handles auth reset for auth-related errors
            } finally {
                setIsAuthLoading(false);
            }
        };

        initializeAuth();
    }, [refreshUser, resetAuthState]);

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== AUTH_EVENT_KEY || !event.newValue) return;

            try {
                const payload = JSON.parse(event.newValue) as { type?: 'login' | 'logout' };
                if (payload?.type === 'logout') {
                    resetAuthState();
                    setIsAuthLoading(false);
                    return;
                }
                if (payload?.type === 'login') {
                    if (hasSessionMarker()) {
                        setIsAuthenticated(true);
                        setIsAuthLoading(false);
                        refreshUser();
                    }
                }
            } catch {
                // ignore
            }
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [refreshUser, resetAuthState]);

    const login = (userData: User) => {
        setSessionMarker();
        const normalized = normalizeUserWithIdentity(userData, null);
        if (normalized) {
            localStorage.setItem('givkoin_user', JSON.stringify(normalized));
            setUser(normalized);
            scheduleUserSessionWarmup(String(normalized._id || normalized.id || ''));
        }
        setIsAuthenticated(true);
        setIsAuthLoading(false);
        broadcastAuthEvent('login');
    };

    const updateUser = (userData: User) => {
        setUser((prev) => {
            const next = normalizeUserWithIdentity(userData, prev || null);
            if (!next) {
                return prev || null;
            }
            localStorage.setItem('givkoin_user', JSON.stringify(next));
            return next;
        });
    };

    const logout = () => {
        apiPost('/auth/logout', {}).catch(() => { });
        resetAuthState();
        setIsAuthLoading(false);
        broadcastAuthEvent('logout');
        router.push(`/${getSiteLanguage()}/login`);
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, isAuthLoading, login, logout, updateUser, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

