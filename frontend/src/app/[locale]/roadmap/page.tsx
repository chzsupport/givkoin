import type { Metadata } from 'next';
import RoadmapPageClient from './RoadmapPageClient';
import { getPageTextBundle } from '@/utils/pageTextStore';
import { buildPublicPageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = params.locale === 'en' ? 'en' : 'ru';
  return buildPublicPageMetadata(
    locale,
    'roadmap',
    locale === 'en' ? 'GIVKOIN Roadmap' : 'Дорожная карта GIVKOIN',
    locale === 'en'
      ? 'Public roadmap of the GIVKOIN project and upcoming work.'
      : 'Публичная дорожная карта проекта GIVKOIN и ближайшие направления работы.',
  );
}

export default async function RoadmapPage() {
  const { roadmapHtml } = await getPageTextBundle();

  return <RoadmapPageClient roadmapHtml={roadmapHtml} />;
}
