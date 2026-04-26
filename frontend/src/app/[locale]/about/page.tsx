import type { Metadata } from 'next';
import AboutPageClient from './AboutPageClient';
import {getPageTextBundle} from '@/utils/pageTextStore';
import { buildPublicPageMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = params.locale === 'en' ? 'en' : 'ru';
  return buildPublicPageMetadata(
    locale,
    'about',
    locale === 'en' ? 'About GIVKOIN' : 'О GIVKOIN',
    locale === 'en'
      ? 'What GIVKOIN is, how the project works, and why the Tree matters.'
      : 'Что такое GIVKOIN, как устроен проект и зачем нужно Древо Мироздания.',
  );
}

export default async function AboutPage() {
  const {about} = await getPageTextBundle();

  return <AboutPageClient content={about} />;
}
