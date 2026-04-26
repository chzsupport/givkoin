import type { MetadataRoute } from 'next';

const LOCALES = ['ru', 'en'] as const;
const PUBLIC_PATHS = ['', 'about', 'rules', 'roadmap', 'feedback'] as const;

function getBaseUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    'https://givkoin.com';
  return value.replace(/\/+$/, '');
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const now = new Date();

  return LOCALES.flatMap((locale) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${baseUrl}/${locale}${path ? `/${path}` : ''}`,
      lastModified: now,
      changeFrequency: path ? 'weekly' : 'daily',
      priority: path ? 0.8 : 1,
    })),
  );
}
