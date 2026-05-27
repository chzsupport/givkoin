import Link from 'next/link';
import { ArrowLeft, Coins, Star, Ticket } from 'lucide-react';
import { formatFortuneK } from '@/components/fortune/fortuneUtils';

type LotteryHeaderProps = {
    fortuneHref: string;
    userK: number;
    userStars?: number;
    t: (key: string) => string;
};

export function LotteryHeader({ fortuneHref, userK, userStars, t }: LotteryHeaderProps) {
    return (
        <header className="flex flex-col gap-2 mb-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
                <Link
                    href={fortuneHref}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-medium">{t('common.back')}</span>
                </Link>

                <div className="flex gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1 backdrop-blur-md text-tiny">
                    <div className="flex items-center gap-1 text-yellow-400 font-bold">
                        <Coins className="w-3 h-3" />
                        <span>{formatFortuneK(userK)}</span>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="flex items-center gap-1 text-blue-300">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{userStars?.toFixed(2) || '0.00'}</span>
                    </div>
                </div>
            </div>

            <h1 className="text-h2 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-blue-400 to-purple-500 tracking-tight flex items-center justify-center gap-2 text-center">
                <Ticket className="w-4 h-4 xl:w-5 xl:h-5 text-blue-400" />
                {t('fortune.lottery_title')}
            </h1>
        </header>
    );
}
