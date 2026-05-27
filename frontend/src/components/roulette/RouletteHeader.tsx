import Link from 'next/link';
import { ArrowLeft, Coins, Sparkles, Star } from 'lucide-react';
import { formatUserK } from '@/utils/formatters';

export function RouletteHeader({
    backHref,
    backLabel,
    k,
    large = false,
    stars,
    title,
}: {
    backHref: string;
    backLabel: string;
    k: number;
    large?: boolean;
    stars?: number;
    title: string;
}) {
    return (
        <header className={`flex flex-col gap-2 ${large ? 'px-4 py-2 2xl:py-4' : 'px-3 py-2'}`}>
            <div className={`flex items-center justify-between ${large ? 'gap-3' : 'gap-2'}`}>
                <Link
                    href={backHref}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md ${large ? '2xl:text-base' : ''}`}
                >
                    <ArrowLeft className={`${large ? 'w-4 h-4 2xl:w-6 2xl:h-6' : 'w-4 h-4'} transition-transform group-hover:-translate-x-1`} />
                    <span className="font-medium">{backLabel}</span>
                </Link>

                <div className={`flex gap-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md text-tiny ${large ? 'px-3 py-1.5 2xl:text-base 2xl:px-5 2xl:py-2' : 'px-2 py-1'}`}>
                    <div className="flex items-center gap-1 text-yellow-400 font-bold">
                        <Coins className={large ? 'w-3.5 h-3.5 2xl:w-5 2xl:h-5' : 'w-3 h-3'} />
                        <span>{formatUserK(k)}</span>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="flex items-center gap-1 text-blue-300">
                        <Star className={`${large ? 'w-3.5 h-3.5 2xl:w-5 2xl:h-5' : 'w-3 h-3'} fill-current`} />
                        <span>{stars?.toFixed(2) || '0.00'}</span>
                    </div>
                </div>
            </div>

            <h1 className="text-h2 font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-orange-500 tracking-tight flex items-center justify-center gap-2 text-center">
                <Sparkles className={large ? 'w-5 h-5 2xl:w-8 2xl:h-8 text-yellow-400' : 'w-4 h-4 text-yellow-400'} />
                {title}
            </h1>
        </header>
    );
}
