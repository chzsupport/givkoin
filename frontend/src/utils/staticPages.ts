import type { LocalizedText } from '@/i18n/localizedContent';

type StaticRulesContent = {
  battle: LocalizedText;
  site: LocalizedText;
  communication: LocalizedText;
};

export type StaticPagesContent = {
  about: LocalizedText;
  roadmapHtml: LocalizedText;
  rules: StaticRulesContent;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001'
    : 'https://your-backend-service.onrender.com');

function createEmptyStaticPagesContent(): StaticPagesContent {
  return {
    about: { ru: '', en: '' },
    roadmapHtml: { ru: '', en: '' },
    rules: {
      battle: { ru: '', en: '' },
      site: { ru: '', en: '' },
      communication: { ru: '', en: '' },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseLocalizedText(value: unknown): LocalizedText {
  if (typeof value === 'string') {
    return {
      ru: value,
      en: '',
    };
  }

  const record = asRecord(value);
  return {
    ru: typeof record?.ru === 'string' ? record.ru : '',
    en: typeof record?.en === 'string' ? record.en : '',
  };
}

export function parseStaticPagesContent(data: unknown): StaticPagesContent {
  const payload = asRecord(data);
  const rules = asRecord(payload?.rules);

  return {
    about: parseLocalizedText(payload?.about),
    roadmapHtml: parseLocalizedText(payload?.roadmapHtml),
    rules: {
      battle: parseLocalizedText(rules?.battle),
      site: parseLocalizedText(rules?.site),
      communication: parseLocalizedText(rules?.communication),
    },
  };
}

export async function getStaticPagesContent(): Promise<StaticPagesContent> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${API_URL}/pages`, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      return createEmptyStaticPagesContent();
    }

    const data: unknown = await res.json().catch(() => ({}));
    return parseStaticPagesContent(data);
  } catch {
    return createEmptyStaticPagesContent();
  } finally {
    clearTimeout(timeoutId);
  }
}
