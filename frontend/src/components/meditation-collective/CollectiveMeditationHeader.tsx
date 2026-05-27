import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';

type CollectiveMeditationHeaderProps = {
    practiceHref: string;
    personalHref: string;
    isSplitHeader: boolean;
    t: (key: string) => string;
};

export function CollectiveMeditationHeader({
    practiceHref,
    personalHref,
    isSplitHeader,
    t,
}: CollectiveMeditationHeaderProps) {
    return (
        <header className={`mb-2 flex-shrink-0 flex flex-col gap-3 ${isSplitHeader ? '' : 'sm:gap-4'}`}>
            <div className="flex items-center gap-2 w-full">
                <Link
                    href={practiceHref}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('meditation_collective.to_practice')}
                </Link>

                <div className="flex flex-1 justify-center">
                    <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
                        <Link
                            href={personalHref}
                            className="px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest transition-all text-white/55 hover:text-white/80"
                        >
                            {t('meditation_collective.tab_me')}
                        </Link>
                        <span className="px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest bg-cyan-500/25 text-cyan-100 border border-cyan-400/30">
                            {t('meditation_collective.tab_we')}
                        </span>
                    </div>
                </div>
            </div>

            <PageTitle
                title={t('meditation_collective.page_title')}
                Icon={Sparkles}
                gradientClassName="from-cyan-200 via-cyan-400 to-blue-500"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
                className="w-fit mx-auto"
            />
        </header>
    );
}
