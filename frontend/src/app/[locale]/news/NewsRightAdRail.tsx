import { AdBlock } from '@/components/AdBlock';

type NewsRightAdRailProps = {
    isDesktop: boolean;
    adWidth: number;
    adHeight: number;
    t: (key: string) => string;
};

export function NewsRightAdRail({ isDesktop, adWidth, adHeight, t }: NewsRightAdRailProps) {
    return (
        <aside
            className={`${isDesktop ? 'flex' : 'hidden'} fixed right-0 top-16 h-[calc(100vh-4rem)] p-2 flex-col items-center justify-start z-20`}
            style={{ width: adWidth + 16 }}
        >
            <div
                className="bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-lg flex flex-col overflow-hidden"
                style={{ width: adWidth, height: adHeight }}
            >
                <div className="text-tiny uppercase tracking-[0.35em] text-gray-600 font-semibold text-center px-1 py-2">
                    {t('landing.ad')}
                </div>
                <div className="flex-1 w-full border-t border-white/5">
                    <AdBlock
                        page="news"
                        placement="news_sidebar_right"
                        hideTitle
                        heightClass="h-full"
                        className="w-full h-full"
                    />
                </div>
            </div>
        </aside>
    );
}
