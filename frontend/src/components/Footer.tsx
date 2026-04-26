'use client';

import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';

export function Footer() {
    const { t, localePath } = useI18n();

    return (
        <footer className="relative z-10 border-t border-glass-white bg-neutral-900 py-6 text-xs text-neutral-400 backdrop-blur-md">
            <div className="container mx-auto px-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-center lg:hidden">
                    <Link href={localePath('/about')} className="text-neutral-300/80 transition-colors hover:text-white">
                        {t('footer.about')}
                    </Link>
                    <Link href={localePath('/rules')} className="text-neutral-300/80 transition-colors hover:text-white">
                        {t('footer.rules')}
                    </Link>
                    <Link href={localePath('/feedback')} className="text-neutral-300/80 transition-colors hover:text-white">
                        {t('footer.feedback')}
                    </Link>
                    <Link href={localePath('/roadmap')} className="text-neutral-300/80 transition-colors hover:text-white">
                        {t('footer.roadmap')}
                    </Link>
                </div>

                <div className="mt-4 flex items-center justify-center text-neutral-300 lg:mt-0 lg:hidden">
                    <span className="font-brand text-[1.125rem] uppercase tracking-[0.18em] text-red-500">
                        GIVKOIN
                    </span>
                </div>

                <div className="hidden lg:flex lg:items-center lg:justify-between">
                    <nav className="flex items-center gap-6">
                        <Link href={localePath('/rules')} className="text-neutral-300/80 transition-colors hover:text-white">
                            {t('footer.rules')}
                        </Link>
                        <Link href={localePath('/feedback')} className="text-neutral-300/80 transition-colors hover:text-white">
                            {t('footer.feedback')}
                        </Link>
                    </nav>

                    <div className="flex flex-1 items-center justify-center text-neutral-300">
                        <span className="font-brand text-[1.375rem] uppercase tracking-[0.18em] text-red-500">
                            GIVKOIN
                        </span>
                    </div>

                    <nav className="flex items-center gap-6">
                        <Link href={localePath('/about')} className="text-neutral-300/80 transition-colors hover:text-white">
                            {t('footer.about')}
                        </Link>
                        <Link href={localePath('/roadmap')} className="text-neutral-300/80 transition-colors hover:text-white">
                            {t('footer.roadmap')}
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
