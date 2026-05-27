import Link from 'next/link';
import { Coins, Sparkles, Star } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { formatFortuneK } from './fortuneUtils';

type FortuneHeaderProps = {
    treeHref: string;
    userK: number;
    userStars?: number;
    t: (key: string) => string;
};

export function FortuneHeader({ treeHref, userK, userStars, t }: FortuneHeaderProps) {
    return (
        <header className="flex flex-col gap-2 mb-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
                <Link
                    href={treeHref}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('fortune.to_tree')}
                </Link>

                <div className="flex gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 backdrop-blur-md text-tiny">
                    <div className="flex items-center gap-1 text-yellow-400 font-bold">
                        <Coins className="w-3.5 h-3.5" />
                        <span>{formatFortuneK(userK)}</span>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="flex items-center gap-1 text-blue-300">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{userStars?.toFixed(2) || '0.00'}</span>
                    </div>
                </div>
            </div>

            <PageTitle
                title={t('fortune.title')}
                Icon={Sparkles}
                gradientClassName="from-yellow-200 via-yellow-400 to-orange-500"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-yellow-400"
            />
        </header>
    );
}
