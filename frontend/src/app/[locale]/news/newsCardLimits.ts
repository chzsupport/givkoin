import type { NewsCard } from './newsPageData';

export function getNewsCardLimits(newsCard: NewsCard | null) {
    return {
        commentsPerPost: newsCard?.commentsPerPost ?? 3,
        dailyCommentsLimit: newsCard?.dailyCommentsLeft ?? 72,
        dailyLikesLimit: newsCard?.dailyLikesLeft ?? 24,
        dailyRepostsLimit: newsCard?.dailyRepostsLeft ?? 24,
        likesPerPost: newsCard?.likesPerPost ?? 1,
        repostsPerPost: newsCard?.repostsPerPost ?? 1,
    };
}
