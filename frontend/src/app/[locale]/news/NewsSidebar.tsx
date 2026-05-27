export function NewsSidebar({
    isDesktop,
    likesPerPost,
    commentsPerPost,
    repostsPerPost,
    dailyLikesLimit,
    dailyCommentsLimit,
    dailyRepostsLimit,
    t,
}: {
    isDesktop: boolean;
    likesPerPost: number;
    commentsPerPost: number;
    repostsPerPost: number;
    dailyLikesLimit: number;
    dailyCommentsLimit: number;
    dailyRepostsLimit: number;
    t: (key: string) => string;
}) {
    return (
        <div className={`${isDesktop ? 'w-56' : 'w-full'} 2xl:w-72 flex flex-col gap-4 2xl:gap-6 shrink-0`}>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 2xl:p-6 backdrop-blur-md">
                <h3 className="text-label 2xl:text-xs font-bold text-neutral-400 mb-3 2xl:mb-4 border-b border-white/5 pb-2">
                    {t('news.limits')}
                </h3>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-label text-neutral-400">{t('news.like')}</span>
                        <span className="text-sm font-bold text-emerald-400">{likesPerPost}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-label text-neutral-400">{t('news.comments_short')}</span>
                        <span className="text-sm font-bold text-amber-400">{commentsPerPost}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-label text-neutral-400">{t('news.repost')}</span>
                        <span className="text-sm font-bold text-blue-400">{repostsPerPost}</span>
                    </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-label text-neutral-400">{t('news.likes_per_day')}</span>
                        <span className="text-sm font-bold text-emerald-400">{dailyLikesLimit}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-label text-neutral-400">{t('news.comments_per_day')}</span>
                        <span className="text-sm font-bold text-amber-400">{dailyCommentsLimit}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-label text-neutral-400">{t('news.reposts_per_day')}</span>
                        <span className="text-sm font-bold text-blue-400">{dailyRepostsLimit}</span>
                    </div>
                </div>
                <p className="text-caption text-neutral-500 mt-3 2xl:mt-4 leading-relaxed italic">
                    {t('news.per_post_hint')}
                </p>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 2xl:p-6">
                <h3 className="text-label 2xl:text-xs font-bold text-blue-400 mb-2 2xl:mb-3">{t('news.about_news')}</h3>
                <p className="text-caption text-neutral-400 leading-relaxed">
                    {t('news.news_updates')}
                </p>
            </div>
        </div>
    );
}
