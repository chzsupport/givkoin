'use client';

import { useCallback } from 'react';
import { getLocalizedField } from '@/i18n/localizedContent';
import type { NewsPost } from './newsPageData';

export function useNewsLocalizedFields(language: string) {
    const getPostTitle = useCallback((post: NewsPost) => {
        return getLocalizedField(post.title, post.translations, 'title', language);
    }, [language]);

    const getPostContent = useCallback((post: NewsPost) => {
        return getLocalizedField(post.content, post.translations, 'content', language);
    }, [language]);

    return {
        getPostContent,
        getPostTitle,
    };
}
