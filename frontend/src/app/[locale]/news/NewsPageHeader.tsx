import Link from 'next/link';
import { BookOpen, Newspaper } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';

type NewsPageHeaderProps = {
    hasPosts: boolean;
    loadingMorePosts: boolean;
    treeHref: string;
    onContinueReading: () => void;
    t: (key: string) => string;
};

export function NewsPageHeader({
    hasPosts,
    loadingMorePosts,
    treeHref,
    onContinueReading,
    t,
}: NewsPageHeaderProps) {
    return (
        <>
            <div className="mb-6 shrink-0 flex justify-between items-center">
                <Link
                    href={treeHref}
                    className="inline-flex items-center gap-2 px-6 py-3 2xl:px-8 2xl:py-4 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.back_to_tree')}
                </Link>

                {hasPosts && (
                    <button
                        onClick={onContinueReading}
                        disabled={loadingMorePosts}
                        className="flex items-center gap-2 px-4 py-3 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-200 hover:bg-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-tiny font-bold uppercase tracking-wider"
                    >
                        <BookOpen size={16} />
                        {t('news.continue_reading')}
                    </button>
                )}
            </div>

            <div className="mb-8">
                <PageTitle
                    title={t('news.title')}
                    Icon={Newspaper}
                    gradientClassName="from-blue-200 via-blue-400 to-cyan-300"
                    iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-blue-300"
                    className="w-fit mx-auto"
                />
                <div className="text-tiny text-neutral-500 uppercase tracking-[0.4em] font-medium mt-2 2xl:mt-4 text-center">
                    {t('news.chronicles')}
                </div>
            </div>
        </>
    );
}
