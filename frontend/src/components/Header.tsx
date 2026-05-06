'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useActiveChat } from '@/context/ActiveChatContext';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useI18n } from '@/context/I18nContext';
import { formatNumber, formatUserK } from '@/utils/formatters';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function Header() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuth();
    const { activeChat } = useActiveChat();
    const { language, t, localePath } = useI18n();



    // Функция для обработки навигации с учетом активного чата
    const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (activeChat) {
            e.preventDefault();
            router.push(localePath(`/chat/${activeChat._id}`));
        }
        // Если нет активного чата - Link работает как обычно
    };

    // Определяем href с учетом активного чата
    const getHref = (defaultHref: string) => {
        return activeChat ? localePath(`/chat/${activeChat._id}`) : defaultHref;
    };

    return (
        <header className="header-element flex-shrink-0 z-50 h-16 border-b border-glass-white bg-glass-white backdrop-blur-md transition-all duration-300">
            <div className="container mx-auto flex h-full min-w-0 items-center justify-between px-3 sm:px-6">
                {/* Left: Brand */}
                <div className="flex shrink-0 items-center">
                    <Link
                        href={getHref(isAuthenticated ? localePath('/tree') : localePath('/'))}
                        className="flex shrink-0 items-end"
                        onClick={(e) => handleNavigation(e)}
                    >
                        <span className="inline-block whitespace-nowrap font-brand text-[1.05rem] leading-[0.84] uppercase text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.35)] sm:text-[1.9rem]">
                            <span className="inline-block origin-bottom-left scale-x-[1.12] pr-[0.14em] font-extrabold italic tracking-[0.08em]">
                                GIVKOIN
                            </span>
                        </span>
                    </Link>
                </div>

                {/* Center: Spacer */}
                <div className="flex-1" />

                {/* Right: Actions */}
                <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                    <LanguageSwitcher />

                    {isAuthenticated ? (
                        <>
                            {/* Mobile: only bell + avatar */}
                            <div className="flex items-center gap-2 sm:hidden">
                                <NotificationCenter />
                                <Link
                                    href={getHref(localePath('/cabinet'))}
                                    className="flex items-center gap-2 rounded-full bg-white/5 pl-1 pr-3 py-1 hover:bg-white/10"
                                    onClick={(e) => handleNavigation(e)}
                                >
                                    <div data-crystal-target="cabinet" className="h-8 w-8 rounded-full bg-primary-dark flex items-center justify-center text-xs text-white">
                                        {user?.nickname?.[0] || 'U'}
                                    </div>
                                </Link>
                            </div>

                            {/* Desktop/Tablet: full set */}
                            <div className="hidden sm:flex items-center gap-4">
                                <NotificationCenter />
                                <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm font-medium text-red-400" title={t('fortune.lives_chat')}>
                                    <span>❤️</span>
                                    <span>{user?.lives ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm font-medium text-yellow-400" title={t('history.soul_stars')}>
                                    <span>⭐</span>
                                    <span>{(user?.stars ?? 0).toFixed(3)}</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm font-medium text-accent-gold" title="GIVKOIN KOIN">
                                    <span>🪙</span>
                                    <span>{formatUserK(user?.k ?? 0)} K</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm font-medium text-glow-blue" title={t('fortune.lumens_energy')}>
                                    <span>✨</span>
                                    <span>{formatNumber(user?.lumens ?? 0, language)} Lm</span>
                                </div>
                                <Link
                                    href={getHref(localePath('/cabinet'))}
                                    className="flex items-center gap-2 rounded-full bg-white/5 pl-1 pr-3 py-1 hover:bg-white/10"
                                    onClick={(e) => handleNavigation(e)}
                                >
                                    <div data-crystal-target="cabinet" className="h-8 w-8 rounded-full bg-primary-dark flex items-center justify-center text-xs text-white">
                                        {user?.nickname?.[0] || 'U'}
                                    </div>
                                </Link>
                            </div>
                        </>
                    ) : (
                        <nav className="flex items-center gap-2 sm:gap-4">
                            <Link
                                href={localePath('/login')}
                                className="hidden min-[390px]:inline whitespace-nowrap text-xs sm:text-sm font-medium text-white/80 transition-colors hover:text-white"
                            >
                                {t('nav.login')}
                            </Link>
                            <Link
                                href={localePath('/register')}
                                className="whitespace-nowrap rounded-xl bg-primary-light px-3 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-primary-dark transition-transform hover:scale-105"
                            >
                                {t('nav.join')}
                            </Link>
                        </nav>
                    )}
                </div>
            </div>
        </header >
    );
}


