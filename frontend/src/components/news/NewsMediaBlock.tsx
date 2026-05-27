'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { describeNewsMedia } from '@/utils/newsMedia';
import { useI18n } from '@/context/I18nContext';

type NewsMediaBlockProps = {
    url?: string | null;
    title: string;
};

export function NewsMediaBlock({ url, title }: NewsMediaBlockProps) {
    const { t } = useI18n();
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const media = describeNewsMedia(url);

    useEffect(() => {
        setFailedUrl(null);
    }, [url]);

    if (!media) return null;

    if (failedUrl === media.url) {
        return (
            <div className="flex flex-col gap-4 p-5 2xl:p-6">
                <div className="text-sm 2xl:text-base font-semibold text-white">
                    {t('news_media.file_unavailable')}
                </div>
                <div className="break-all text-xs 2xl:text-sm text-neutral-400">
                    {media.url}
                </div>
                <a
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:bg-white/10"
                >
                    {t('news_media.open_file')}
                </a>
            </div>
        );
    }

    if (media.kind === 'image') {
        return (
            <div className="w-full bg-black/20">
                <Image
                    src={media.url}
                    alt={title}
                    width={1200}
                    height={675}
                    sizes="100vw"
                    unoptimized
                    className="block h-auto w-full"
                    onError={() => setFailedUrl(media.url)}
                />
            </div>
        );
    }

    if (media.kind === 'video') {
        return (
            <video
                src={media.url}
                className="block h-auto w-full bg-black"
                controls
                playsInline
                preload="metadata"
                onError={() => setFailedUrl(media.url)}
            />
        );
    }

    if (media.kind === 'audio') {
        return (
            <div className="w-full bg-black/25 p-5 2xl:p-6">
                <audio
                    src={media.url}
                    className="w-full"
                    controls
                    preload="metadata"
                    onError={() => setFailedUrl(media.url)}
                />
            </div>
        );
    }

    if (media.kind === 'embed' && media.embedUrl) {
        return (
            <div className="relative w-full aspect-video bg-black">
                <iframe
                    src={media.embedUrl}
                    title={title}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                />
            </div>
        );
    }

    const hostLabel = media.hostLabel === 'external'
        ? t('news_media.external_link')
        : media.hostLabel;

    return (
        <div className="flex flex-col gap-4 p-5 2xl:p-6">
            <div className="text-sm 2xl:text-base font-semibold text-white">
                {t('news_media.embed_unavailable')}
            </div>
            <div className="text-xs 2xl:text-sm text-neutral-400">
                {t('news_media.source')}: {hostLabel}
            </div>
            <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:bg-white/10"
            >
                {t('news_media.open_link')}
            </a>
        </div>
    );
}
