import type { Metadata } from 'next';
import RulesPageClient from './RulesPageClient';
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
    'rules',
    locale === 'en' ? 'GIVKOIN Rules' : 'Правила GIVKOIN',
    locale === 'en'
      ? 'Service rules, communication rules, and battle rules for GIVKOIN.'
      : 'Правила сервиса, общения и участия в боях GIVKOIN.',
  );
}

export default async function RulesPage() {
  const { rules } = await getPageTextBundle();

  return <RulesPageClient rules={rules} />;
}
