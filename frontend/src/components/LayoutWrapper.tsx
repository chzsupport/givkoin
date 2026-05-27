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
import { useI18n } from '@/context/I18nContext';
import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';

import { useCrystal } from '@/context/CrystalContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AdBoostHost } from '@/components/AdBoostHost';
import { HumanCheckGate } from '@/components/human-check/HumanCheckGate';
import { AdblockNoticeModal } from '@/components/layout-wrapper/AdblockNoticeModal';
import { BackendUnavailableScreen } from '@/components/layout-wrapper/BackendUnavailableScreen';
import { CrystalShardOverlay } from '@/components/layout-wrapper/CrystalShardOverlay';
import { LoadingScreen } from '@/components/layout-wrapper/LoadingScreen';
import { useCrystalShardPosition } from '@/components/layout-wrapper/useCrystalShardPosition';
import { useLayoutActivityTracking } from '@/components/layout-wrapper/useLayoutActivityTracking';
import {
    isOpenRoute,
    pageHasAds,
    scanForAdSlots
} from '@/components/layout-wrapper/layoutWrapperRules';

const CallNotification = dynamic(
    () => import('./CallNotification').then((m) => m.CallNotification),
    { ssr: false }
);

const AnomalyOverlay = dynamic(
    () => import('@/components/NightShift/AnomalyOverlay').then((m) => m.AnomalyOverlay),
    { ssr: false }
);

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isAuthenticated, isAuthLoading } = useAuth();
    const { backendAvailable, backendStatusLoading, backendStatusMessage, refreshBackendStatus } = useBackendStatus();
    const { isLoading } = useActiveChat();
    const { t, localePath } = useI18n();
    const { currentPageShard } = useCrystal();
    const shardPosition = useCrystalShardPosition(pathname, currentPageShard);
    useLayoutActivityTracking({ pathname, userId: user?._id });

    const [adblockNoticeVisible, setAdblockNoticeVisible] = useState(false);
    const adblockCooldownTimerRef = useRef<number | null>(null);
    const adblockObserverRef = useRef<MutationObserver | null>(null);
    const adblockHasAdSlotsRef = useRef(false);
    const adblockCheckingRef = useRef(false);

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

    // Глобальное отслеживание статуса (занятость в ЛК, чате или бою)
    useStatusTracking(user?._id);

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
    }, [clearAdblockTimers, pathname, runAdblockCheck]);

    // Страницы без глобального Header/Footer
    const cleanPathname = normalizeSitePath(pathname || '/');
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

    const shouldShowHeaderFooter = !excludedPaths.includes(cleanPathname) && !pathStartsWith(cleanPathname, '/chat');

    if (!backendStatusLoading && !backendAvailable) {
        return (
            <BackendUnavailableScreen
                title={t('server.unavailable_title')}
                body={backendStatusMessage || t('server.unavailable_body')}
                buttonLabel={t('server.check_again')}
                onRefresh={() => {
                    refreshBackendStatus().catch(() => { });
                }}
            />
        );
    }

    // Если идёт проверка активного чата и мы не на странице авторизации/чата - показываем спиннер
    if ((isLoading || isAuthLoading) && !isAuthPage && !pathStartsWith(cleanPathname, '/chat')) {
        return <LoadingScreen label={t('common.loading')} />;
    }

    const adblockNotice = adblockNoticeVisible ? (
        <AdblockNoticeModal
            title={t('ads.adblock_title')}
            body={t('ads.adblock_body')}
            closeLabel={t('common.close')}
            onClose={() => {
                setAdblockNoticeVisible(false);
                scheduleAdblockRecheck();
            }}
        />
    ) : null;

    const crystalOverlay = (
        <CrystalShardOverlay
            position={shardPosition}
            shard={currentPageShard}
        />
    );

    // Если есть Header/Footer — используем flex layout для правильного позиционирования
    if (shouldShowHeaderFooter) {
        return (
            <ToastProvider>
                <div className="min-h-screen flex flex-col relative">
                    <AnomalyOverlay />
                    <Header />
                    <main className="relative flex-1 flex flex-col min-h-0">
                        {children}
                    </main>
                    {adblockNotice}
                    {crystalOverlay}
                    <Footer />
                    <AdBoostHost />
                    <HumanCheckGate />
                    <CallNotification />
                </div>
            </ToastProvider>
        );
    }

    // Страницы без Header/Footer
    return (
        <ToastProvider>
            <LanguageSwitcher floating />
            <main className="relative">
                <AnomalyOverlay />
                {children}
                {adblockNotice}
                {crystalOverlay}
                <AdBoostHost />
                <HumanCheckGate />
                <CallNotification />
            </main>
        </ToastProvider>
    );
}
