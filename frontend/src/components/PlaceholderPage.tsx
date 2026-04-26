'use client';

import { PageBackground } from '@/components/PageBackground';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';

interface PlaceholderPageProps {
    title: string;
    description?: string;
    backLink?: string;
    backLabel?: string;
    icon?: string;
}

export function PlaceholderPage({
    title,
    description,
    backLink = '/tree',
    backLabel,
    icon = '🚧'
}: PlaceholderPageProps) {
    const { localePath, t } = useI18n();
    const resolvedDescription = description || t('placeholder.description');
    const resolvedBackLabel = backLabel || t('placeholder.back_to_tree');
    const resolvedBackLink = backLink.startsWith('/') ? localePath(backLink) : backLink;

    return (
        <div className="relative h-full w-full overflow-hidden">
            <PageBackground />

            <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-12">
                <div className="w-full max-w-2xl">
                    {/* Back Button */}
                    <div className="mb-8">
                        <Link
                            href={resolvedBackLink}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-caption hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                        >
                            <span className="group-hover:-translate-x-1 transition-transform">←</span> {resolvedBackLabel}
                        </Link>
                    </div>

                    {/* Content */}
                    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-12 backdrop-blur-xl text-center">
                        <div className="mb-6 text-6xl">{icon}</div>
                        <h1 className="mb-4 text-3xl font-bold text-white uppercase tracking-wider">
                            {title}
                        </h1>
                        <p className="text-white/60 leading-relaxed max-w-lg mx-auto">
                            {resolvedDescription}
                        </p>

                        <div className="mt-8 flex justify-center gap-4">
                            <Link
                                href={resolvedBackLink}
                                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-sm font-bold text-white hover:from-indigo-600 hover:to-purple-700 transition-all active:scale-95"
                            >
                                {resolvedBackLabel}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
