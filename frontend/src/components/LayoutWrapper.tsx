'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Header } from './Header';
import { Footer } from './Footer';
import { useActiveChat } from '@/context/ActiveChatContext';
import { useStatusTracking } from '@/hooks/useStatusTracking';
import { useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { useBackendStatus } from '@/context/BackendStatusContext';
import { apiPost, apiPostKeepalive } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

import { useCrystal } from '@/context/CrystalContext';
import { CrystalShard } from '@/components/CrystalShard';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BoostProvider } from '@/context/BoostContext';

const NAVIGATION_RULES: Record<string, string[][]> = {
    '/fortune/roulette': [['/fortune'], ['/tree', '/fortune']],
    '/fortune/lottery': [['/fortune'], ['/tree', '/fortune']],
    '/activity/achievements': [['/cabinet/activity']],
    '/activity/collect': [['/cabinet/activity']],
    '/activity/night-shift': [['/cabinet/activity']],
    '/activity/attendance': [['/cabinet/activity']],
};

const CallNotification = dynamic(
    () => import('./CallNotification').then((m) => m.CallNotification),
    { ssr: false }
);

const AnomalyOverlay = dynamic(
    () => import('@/components/NightShift/AnomalyOverlay').then((m) => m.AnomalyOverlay),
    { ssr: false }
);

const LOCALE_PREFIX_RE = /^\/(en|ru)(\/|$)/;

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isAuthenticated, isAuthLoading } = useAuth();
    const { backendAvailable, backendStatusLoading, backendStatusMessage, refreshBackendStatus } = useBackendStatus();
    const { isLoading } = useActiveChat();
    const { t, localePath } = useI18n();
    const { currentPageShard } = useCrystal();

    const stripLocalePrefix = useCallback((path: string) => {
        return String(path || '').replace(LOCALE_PREFIX_RE, '/') || '/';
    }, []);

    const isOpenRoute = (path: string) => {
        const clean = stripLocalePrefix(path);
        if (clean === '/') return true;
        if (clean === '/login' || clean === '/register' || clean === '/forgot-password' || clean === '/reset-password') return true;
        if (clean.startsWith('/confirm')) return true;
        if (clean === '/about' || clean === '/rules' || clean === '/feedback' || clean === '/roadmap') return true;
        return false;
    };

    const lastPageViewRef = useRef<{ path: string; at: number } | null>(null);
    const pageSessionRef = useRef<{ path: string; startedAt: number; sent: boolean } | null>(null);
    const lastNavigationIntentRef = useRef<{ path: string; at: number } | null>(null);
    const recentPathsRef = useRef<string[]>([]);
    const [shardPosition, setShardPosition] = useState<{ top: number; left: number } | null>(null);
    const [adblockNoticeVisible, setAdblockNoticeVisible] = useState(false);
    const adblockCooldownTimerRef = useRef<number | null>(null);
    const adblockObserverRef = useRef<MutationObserver | null>(null);
    const adblockHasAdSlotsRef = useRef(false);
    const adblockCheckingRef = useRef(false);

    const normalizeTrackedPath = useCallback((path: string) => {
        const clean = String(path || '').split('?')[0].trim();
        if (!clean) return '/';
        return clean.slice(0, 120);
    }, []);

    const clearAdblockTimers = useCallback(() => {
        if (adblockCooldownTimerRef.current) {
            window.clearTimeout(adblockCooldownTimerRef.current);
            adblockCooldownTimerRef.current = null;
        }
    }, []);

    const detectAdblock = useCallback(async () => {
        if (typeof document === 'undefined') return false;

        const scriptProbe = () => new Promise<boolean>((resolve) => {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
            script.onload = () => {
                script.remove();
                resolve(false);
            };
            script.onerror = () => {
                script.remove();
                resolve(true);
            };
            document.head.appendChild(script);

            window.setTimeout(() => {
                script.remove();
                resolve(false);
            }, 1500);
        });

        const bait = document.createElement('div');
        bait.className = 'ad ads ad-banner adsbox ad-placement ad-container';
        bait.style.cssText = 'position:absolute; left:-9999px; top:-9999px; width:1px; height:1px; pointer-events:none;';
        document.body.appendChild(bait);

        await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 30);
        });

        const style = window.getComputedStyle(bait);
        const blocked =
            bait.offsetParent === null ||
            bait.offsetHeight === 0 ||
            bait.offsetWidth === 0 ||
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0';

        bait.remove();

        if (blocked) return true;

        const scriptBlocked = await scriptProbe();
        return scriptBlocked;
    }, []);

    const scanForAdSlots = useCallback(() => {
        if (typeof document === 'undefined') return false;
        return Boolean(document.querySelector('[data-ad-block="1"]'));
    }, []);

    const pageHasAds = useCallback((path: string) => {
        const clean = stripLocalePrefix(path);
        const exactPaths = new Set([
            '/about',
            '/rules',
            '/roadmap',
            '/feedback',
            '/tree',
            '/news',
            '/chronicle',
            '/entity/profile',
            '/shop',
            '/practice',
            '/practice/gratitude',
            '/practice/meditation/me',
            '/practice/meditation/we',
            '/galaxy',
            '/fortune',
            '/fortune/roulette',
            '/fortune/lottery',
            '/bridges',
            '/activity/night-shift',
            '/activity/attendance',
            '/activity/collect',
            '/activity/achievements',
        ]);

        if (exactPaths.has(clean)) return true;

        if (clean.startsWith('/chat/')) return true;

        return false;
    }, [stripLocalePrefix]);

    const runAdblockCheck = useCallback(async () => {
        if (adblockCheckingRef.current) return;
        if (!adblockHasAdSlotsRef.current) {
            setAdblockNoticeVisible(false);
            clearAdblockTimers();
            return;
        }

        adblockCheckingRef.current = true;
        try {
            const blocked = await detectAdblock();
            if (!adblockHasAdSlotsRef.current) {
                setAdblockNoticeVisible(false);
                clearAdblockTimers();
                return;
            }
            setAdblockNoticeVisible(blocked);
            if (!blocked) {
                clearAdblockTimers();
            }
        } finally {
            adblockCheckingRef.current = false;
        }
    }, [clearAdblockTimers, detectAdblock]);

    const scheduleAdblockRecheck = useCallback(() => {
        clearAdblockTimers();
        adblockCooldownTimerRef.current = window.setTimeout(() => {
            void runAdblockCheck();
        }, 30_000);
    }, [clearAdblockTimers, runAdblockCheck]);

    const startPageSession = useCallback((path: string) => {
        pageSessionRef.current = {
            path: normalizeTrackedPath(path),
            startedAt: Date.now(),
            sent: false,
        };
    }, [normalizeTrackedPath]);

    const classifyNavigation = useCallback((path: string, previousPath: string) => {
        const currentPath = normalizeTrackedPath(path);
        const normalizedPrevious = normalizeTrackedPath(previousPath);
        const intent = lastNavigationIntentRef.current;
        const intentFresh = intent && (Date.now() - intent.at) <= 4000;
        const viaUiClick = Boolean(intentFresh && normalizeTrackedPath(intent.path) === currentPath);
        const navigationSource = !normalizedPrevious
            ? 'initial_load'
            : viaUiClick
                ? 'ui_click'
                : 'direct_open';

        const options = NAVIGATION_RULES[currentPath] || [];
        const recentPaths = recentPathsRef.current;
        const chainExpected = options.length > 0;
        const chainSatisfied = !chainExpected || options.some((sequence) => {
            if (!sequence.length) return true;
            const tail = recentPaths.slice(-sequence.length);
            return sequence.every((value, index) => normalizeTrackedPath(tail[index]) === normalizeTrackedPath(value));
        });

        return {
            previousPath: normalizedPrevious,
            navigationSource,
            viaUiClick,
            uiTargetPath: viaUiClick ? currentPath : '',
            isDirectNavigation: navigationSource === 'direct_open',
            chainExpected,
            chainSatisfied,
            skippedPaths: chainExpected && !chainSatisfied
                ? Array.from(new Set(options.flat().map((item) => normalizeTrackedPath(item))))
                : [],
            navigationLatencyMs: viaUiClick && intent ? Date.now() - intent.at : null,
        };
    }, [normalizeTrackedPath]);

    const flushPageSession = useCallback((useKeepalive: boolean) => {
        const current = pageSessionRef.current;
        if (!current || current.sent) return;

        const elapsedMs = Date.now() - current.startedAt;
        current.sent = true;
        pageSessionRef.current = null;

        // Ignore ultra-short visits caused by instant rerenders/navigation.
        if (elapsedMs < 1000) return;

        const payload = {
            page: current.path,
            placement: 'page_session',
            eventType: 'session',
            durationSeconds: Math.round(elapsedMs / 1000),
        };

        const request = useKeepalive
            ? apiPostKeepalive('/ads/impression', payload)
            : apiPost('/ads/impression', payload);
        Promise.resolve(request).catch(() => { });
    }, []);

    // Поиск заголовка страницы и определение координат для осколка
    useEffect(() => {
        if (!currentPageShard) {
            setShardPosition(null);
            return;
        }

        const getTextRect = (el: Element): DOMRect | null => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
                const text = (node.textContent || '').trim();
                if (!text) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                const rects = range.getClientRects();
                if (rects.length > 0) return rects[0];
            }
            return null;
        };

        const findAndPosition = () => {
            const scrollY = window.scrollY || document.documentElement.scrollTop;

            const SHARD_WIDTH = 25;
            const side = currentPageShard.side || 'right';

            const main = document.querySelector('main');
            const mainH1 = main?.querySelector('h1') || null;
            const pageH1 = document.querySelector('h1');
            const h2 = document.querySelector('main h2');
            const target = mainH1 || pageH1 || h2;
            
            if (target) {
                const tRect = getTextRect(target) || target.getBoundingClientRect();
                const viewTop = tRect.top + (tRect.height / 2) - (SHARD_WIDTH / 2);
                const top = viewTop + scrollY;

                let left: number;
                const sideOffset = 14;

                if (side === 'left') {
                    left = tRect.left - SHARD_WIDTH - sideOffset;
                } else {
                    left = tRect.right + sideOffset;
                }

                // Корректировка, чтобы не выходило за края экрана
                if (left < 10) left = 10;
                if (left > window.innerWidth - SHARD_WIDTH - 10) left = window.innerWidth - SHARD_WIDTH - 10;
                
                setShardPosition({ top, left });
                return;
            }

            setShardPosition({
                top: scrollY + 120,
                left: window.innerWidth - 80
            });
        };

        // Небольшая задержка, чтобы контент и шрифты успели подгрузиться
        const timer = setTimeout(findAndPosition, 500);

        // Пересчитываем координаты при ресайзе (при скролле не нужно, т.к. position: absolute + scrollY уже учитывает это)
        // ХОТЯ: если верстка адаптивная и элементы сдвигаются при скролле (липкие хедеры и т.д.), то может потребоваться.
        // Но для статических заголовков достаточно resize.
        window.addEventListener('resize', findAndPosition);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', findAndPosition);
        };
    }, [pathname, currentPageShard]);

    // Глобальное отслеживание статуса (занятость в ЛК, чате или бою)
    useStatusTracking(user?._id);

    useEffect(() => {
        if (!user?._id || !pathname) return;

        const now = Date.now();
        const last = lastPageViewRef.current;
        if (last && last.path === pathname && now - last.at < 10_000) return;

        const previousPath = recentPathsRef.current.length
            ? recentPathsRef.current[recentPathsRef.current.length - 1]
            : '';
        const navigationMeta = classifyNavigation(pathname, previousPath);
        lastPageViewRef.current = { path: pathname, at: now };
        apiPost('/activity/page-view', {
            path: pathname,
            ...navigationMeta,
        }).catch(() => { });

        recentPathsRef.current = [...recentPathsRef.current, normalizeTrackedPath(pathname)].slice(-8);
        if (navigationMeta.viaUiClick) {
            lastNavigationIntentRef.current = null;
        }
    }, [classifyNavigation, normalizeTrackedPath, pathname, user?._id]);

    useEffect(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target) return;
            const anchor = target.closest('a[href]');
            if (!anchor) return;
            const href = anchor.getAttribute('href') || '';
            if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            if (!href.startsWith('/')) return;
            lastNavigationIntentRef.current = {
                path: normalizeTrackedPath(href),
                at: Date.now(),
            };
        };

        document.addEventListener('click', handleDocumentClick, true);
        return () => document.removeEventListener('click', handleDocumentClick, true);
    }, [normalizeTrackedPath]);

    useEffect(() => {
        if (!pathname) return;

        flushPageSession(false);
        startPageSession(pathname);

        return () => {
            flushPageSession(true);
        };
    }, [flushPageSession, pathname, startPageSession]);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                flushPageSession(true);
                return;
            }
            if (document.visibilityState === 'visible' && pathname && !pageSessionRef.current) {
                startPageSession(pathname);
            }
        };

        const handlePageHide = () => {
            flushPageSession(true);
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
        };
    }, [flushPageSession, pathname, startPageSession]);

    useEffect(() => {
        if (!user?._id) return;

        let leaveSent = false;
        const sendLeave = () => {
            if (leaveSent) return;
            leaveSent = true;
            apiPostKeepalive('/activity/leave', {});
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                sendLeave();
            } else {
                leaveSent = false;
            }
        };

        const handlePageHide = () => sendLeave();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
        };
    }, [user?._id]);

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const updateAdSlots = () => {
            const hasSlots = scanForAdSlots() || pageHasAds(pathname);
            const prev = adblockHasAdSlotsRef.current;
            adblockHasAdSlotsRef.current = hasSlots;

            if (!hasSlots) {
                setAdblockNoticeVisible(false);
                clearAdblockTimers();
                return;
            }

            if (!prev && hasSlots) {
                void runAdblockCheck();
            }
        };

        updateAdSlots();

        if (adblockObserverRef.current) {
            adblockObserverRef.current.disconnect();
            adblockObserverRef.current = null;
        }

        const observer = new MutationObserver(() => {
            updateAdSlots();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        adblockObserverRef.current = observer;

        const forceCheck = () => {
            adblockHasAdSlotsRef.current = scanForAdSlots() || pageHasAds(pathname);
            void runAdblockCheck();
        };
        window.addEventListener('adblock:force-check', forceCheck as EventListener);

        return () => {
            window.removeEventListener('adblock:force-check', forceCheck as EventListener);
            observer.disconnect();
            adblockObserverRef.current = null;
            clearAdblockTimers();
        };
    }, [clearAdblockTimers, pageHasAds, pathname, runAdblockCheck, scanForAdSlots]);

    // Страницы без глобального Header/Footer
    const cleanPathname = stripLocalePrefix(pathname);
    const excludedPaths = ['/', '/battle', '/evil-root'];

    // Публичные страницы (без авторизации)
    const isAuthPage = isOpenRoute(pathname);

    useEffect(() => {
        if (!pathname) return;
        if (isAuthLoading) return;
        if (isAuthenticated) return;
        if (isAuthPage) return;
        router.replace(localePath('/login'));
    }, [isAuthLoading, isAuthenticated, pathname, router, localePath, isAuthPage]);

    const shouldShowHeaderFooter = !excludedPaths.includes(cleanPathname) && !cleanPathname.startsWith('/chat');

    if (!backendStatusLoading && !backendAvailable) {
        return (
            <ToastProvider>
                <LanguageSwitcher floating />
                <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-6">
                    <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-3xl">
                            !
                        </div>
                        <h1 className="mb-3 text-2xl font-bold text-white">
                            {t('server.unavailable_title')}
                        </h1>
                        <p className="mb-6 text-sm leading-6 text-white/70">
                            {backendStatusMessage || t('server.unavailable_body')}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                refreshBackendStatus().catch(() => { });
                            }}
                            className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                        >
                            {t('server.check_again')}
                        </button>
                    </div>
                </div>
            </ToastProvider>
        );
    }

    // Если идёт проверка активного чата и мы не на странице авторизации/чата - показываем спиннер
    if ((isLoading || isAuthLoading) && !isAuthPage && !pathname.startsWith('/chat')) {
        return (
            <>
                <LanguageSwitcher floating />
                <div className="min-h-screen flex items-center justify-center bg-neutral-900">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-white/60 text-sm">{t('common.loading')}</span>
                    </div>
                </div>
            </>
        );
    }

    // Компонент осколка с абсолютным позиционированием
    const crystalOverlay = (shardPosition && currentPageShard) ? (
        <div
            style={{
                position: 'absolute',
                top: shardPosition.top,
                left: shardPosition.left,
                zIndex: 9999,
                pointerEvents: 'auto',
                // Плавная анимация перемещения при ресайзе
                transition: 'top 0.3s ease-out, left 0.3s ease-out',
            }}
        >
            <CrystalShard
                shardId={currentPageShard.shardId}
                shardIndex={currentPageShard.shardIndex}
            />
        </div>
    ) : null;

    // Если есть Header/Footer — используем flex layout для правильного позиционирования
    if (shouldShowHeaderFooter) {
        return (
            <BoostProvider>
            <ToastProvider>
                <div className="min-h-screen flex flex-col relative">
                    <AnomalyOverlay />
                    <Header />
                    <main className="relative flex-1 flex flex-col min-h-0">
                        {children}
                    </main>
                    {adblockNoticeVisible && (
                        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                            <div className="w-[min(560px,92vw)] md:w-[min(30vw,560px)] md:min-w-[420px] md:h-[min(30vh,360px)] max-h-[80vh] overflow-auto rounded-2xl border border-amber-500/30 bg-black/85 shadow-2xl px-6 py-5">
                                <div className="flex flex-col gap-4">
                                    <div className="text-white font-extrabold text-2xl leading-tight text-center">
                                        {t('ads.adblock_title')}
                                    </div>
                                    <div className="text-white/85 text-base leading-relaxed text-center">
                                        {t('ads.adblock_body')}
                                    </div>
                                    <div className="flex justify-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAdblockNoticeVisible(false);
                                                scheduleAdblockRecheck();
                                            }}
                                            className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-base font-semibold text-white/95 hover:bg-white/10"
                                        >
                                            {t('common.close')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {crystalOverlay}
                    <Footer />
                    <CallNotification />
                </div>
            </ToastProvider>
            </BoostProvider>
        );
    }

    // Страницы без Header/Footer
    return (
        <BoostProvider>
        <ToastProvider>
            <LanguageSwitcher floating />
            <main className="relative">
                <AnomalyOverlay />
                {children}
                {adblockNoticeVisible && (
                    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                        <div className="w-[min(560px,92vw)] md:w-[min(30vw,560px)] md:min-w-[420px] md:h-[min(30vh,360px)] max-h-[80vh] overflow-auto rounded-2xl border border-amber-500/30 bg-black/85 shadow-2xl px-6 py-5">
                            <div className="flex flex-col gap-4">
                                <div className="text-white font-extrabold text-2xl leading-tight text-center">
                                    {t('ads.adblock_title')}
                                </div>
                                <div className="text-white/85 text-base leading-relaxed text-center">
                                    {t('ads.adblock_body')}
                                </div>
                                <div className="flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAdblockNoticeVisible(false);
                                            scheduleAdblockRecheck();
                                        }}
                                        className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-base font-semibold text-white/95 hover:bg-white/10"
                                    >
                                        {t('common.close')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {crystalOverlay}
                <CallNotification />
            </main>
        </ToastProvider>
        </BoostProvider>
    );
}
