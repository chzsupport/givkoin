const { getSupabaseClient } = require('../lib/supabaseClient');
const { getSetting } = require('../utils/settings');
const {
  buildLocalizedText,
  normalizeLocalizedTextInput,
} = require('../utils/localizedContent');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const STATIC_PAGES_CACHE_TTL_MS = Math.max(0, Number(process.env.STATIC_PAGES_CACHE_TTL_MS) || 30_000);
let staticPagesCachePayload = null;
let staticPagesCacheAtMs = 0;

const STATIC_PAGE_DEFS = {
  about: { slug: 'about', title: 'О нас', settingKey: 'PAGE_ABOUT' },
  roadmapHtml: { slug: 'roadmap', title: 'Дорожная карта', settingKey: 'PAGE_ROADMAP_HTML' },
  rulesBattle: { slug: 'rules-battle', title: 'Правила боя', settingKey: 'RULES_BATTLE' },
  rulesSite: { slug: 'rules-site', title: 'Правила сайта', settingKey: 'RULES_SITE' },
  rulesCommunication: { slug: 'rules-communication', title: 'Правила общения', settingKey: 'RULES_COMMUNICATION' },
};

function normalizeContent(value) {
  return String(value ?? '');
}

function normalizeLocalizedContent(value) {
  const localized = normalizeLocalizedTextInput(value, '');
  return {
    ru: normalizeContent(localized.ru),
    en: normalizeContent(localized.en),
  };
}

function stringifyContentValue(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value || '');
  } catch (_err) {
    return String(value || '');
  }
}

function getPageContentTranslation(page, language) {
  const source = page?.translations && typeof page.translations === 'object'
    ? page.translations[language]
    : null;
  if (!source || typeof source !== 'object') return '';
  return stringifyContentValue(source.content);
}

function buildLocalizedPageContent(page) {
  if (!page) return buildLocalizedText('', '');
  return buildLocalizedText(
    stringifyContentValue(page.content),
    getPageContentTranslation(page, 'en')
  );
}

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : (data.createdAt || null),
    updatedAt: row.updated_at ? new Date(row.updated_at) : (data.updatedAt || null),
  };
}

async function findContentPageBySlug(slug) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'ContentPage')
    .range(0, 999);
  if (error || !Array.isArray(data)) return null;

  const rows = data
    .map(mapDocRow)
    .filter(Boolean)
    .filter((row) => row.slug === slug);

  if (!rows.length) return null;
  return rows[0];
}

async function findContentPageBySlugAndStatus(slug) {
  const allBySlug = await findContentPageBySlug(slug);
  if (!allBySlug) return null;

  const status = allBySlug.status;
  if (status === 'published' || status === 'draft') {
    return allBySlug;
  }

  return null;
}

async function upsertContentPageDoc(id, doc) {
  const supabase = getSupabaseClient();
  const payload = { ...doc };
  delete payload._id;
  delete payload.id;

  const nowIso = new Date().toISOString();
  await supabase.from(DOC_TABLE).upsert(
    {
      model: 'ContentPage',
      id: String(id),
      data: payload,
      created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'model,id', ignoreDuplicates: false }
  );
}

async function getCmsPageContent(slug) {
  const page = await findContentPageBySlugAndStatus(slug);
  if (!page) return null;
  return buildLocalizedPageContent(page);
}

async function getStaticPagesContent() {
  if (STATIC_PAGES_CACHE_TTL_MS > 0 && staticPagesCachePayload && (Date.now() - staticPagesCacheAtMs) < STATIC_PAGES_CACHE_TTL_MS) {
    return staticPagesCachePayload;
  }

  const [cmsAbout, cmsRoadmap, cmsRulesBattle, cmsRulesSite, cmsRulesCommunication] = await Promise.all([
    getCmsPageContent(STATIC_PAGE_DEFS.about.slug),
    getCmsPageContent(STATIC_PAGE_DEFS.roadmapHtml.slug),
    getCmsPageContent(STATIC_PAGE_DEFS.rulesBattle.slug),
    getCmsPageContent(STATIC_PAGE_DEFS.rulesSite.slug),
    getCmsPageContent(STATIC_PAGE_DEFS.rulesCommunication.slug),
  ]);

  const [legacyAbout, legacyRoadmap, legacyRulesBattle, legacyRulesSite, legacyRulesCommunication] = await Promise.all([
    getSetting(STATIC_PAGE_DEFS.about.settingKey, ''),
    getSetting(STATIC_PAGE_DEFS.roadmapHtml.settingKey, ''),
    getSetting(STATIC_PAGE_DEFS.rulesBattle.settingKey, ''),
    getSetting(STATIC_PAGE_DEFS.rulesSite.settingKey, ''),
    getSetting(STATIC_PAGE_DEFS.rulesCommunication.settingKey, ''),
  ]);

  const payload = {
    about: cmsAbout ?? buildLocalizedText(normalizeContent(legacyAbout), ''),
    roadmapHtml: cmsRoadmap ?? buildLocalizedText(normalizeContent(legacyRoadmap), ''),
    rules: {
      battle: cmsRulesBattle ?? buildLocalizedText(normalizeContent(legacyRulesBattle), ''),
      site: cmsRulesSite ?? buildLocalizedText(normalizeContent(legacyRulesSite), ''),
      communication: cmsRulesCommunication ?? buildLocalizedText(normalizeContent(legacyRulesCommunication), ''),
    },
  };

  if (STATIC_PAGES_CACHE_TTL_MS > 0) {
    staticPagesCachePayload = payload;
    staticPagesCacheAtMs = Date.now();
  }

  return payload;
}

async function upsertStaticPage({ slug, title, content, userId = null }) {
  const normalized = normalizeLocalizedContent(content);
  const existing = await findContentPageBySlug(slug);

  if (!existing) {
    const id = `k_${slug}_${Date.now()}`;
    const doc = {
      title,
      slug,
      status: 'published',
      content: normalized.ru,
      translations: {
        en: {
          content: normalized.en,
        },
      },
      seo: {
        title,
        description: '',
        keywords: [],
        slug,
      },
      publishedAt: new Date().toISOString(),
      createdBy: userId || null,
      updatedBy: userId || null,
    };
    await upsertContentPageDoc(id, doc);
    return { ...doc, _id: id };
  }

  const updated = {
    ...existing,
    title,
    status: 'published',
    content: normalized.ru,
    translations: {
      ...(existing?.translations && typeof existing.translations === 'object' ? existing.translations : {}),
      en: {
        ...(
          existing?.translations?.en && typeof existing.translations.en === 'object'
            ? existing.translations.en
            : {}
        ),
        content: normalized.en,
      },
    },
    seo: {
      ...(existing.seo || {}),
      title,
      slug,
    },
    publishedAt: new Date().toISOString(),
    updatedBy: userId || null,
  };
  await upsertContentPageDoc(existing._id, updated);
  return updated;
}

async function syncStaticPagesContent({ about, roadmapHtml, rules } = {}, userId = null) {
  const tasks = [];

  if (about !== undefined) {
    tasks.push(upsertStaticPage({
      slug: STATIC_PAGE_DEFS.about.slug,
      title: STATIC_PAGE_DEFS.about.title,
      content: about,
      userId,
    }));
  }

  if (roadmapHtml !== undefined) {
    tasks.push(upsertStaticPage({
      slug: STATIC_PAGE_DEFS.roadmapHtml.slug,
      title: STATIC_PAGE_DEFS.roadmapHtml.title,
      content: roadmapHtml,
      userId,
    }));
  }

  if (rules && typeof rules === 'object') {
    if (Object.prototype.hasOwnProperty.call(rules, 'battle')) {
      tasks.push(upsertStaticPage({
        slug: STATIC_PAGE_DEFS.rulesBattle.slug,
        title: STATIC_PAGE_DEFS.rulesBattle.title,
        content: rules.battle,
        userId,
      }));
    }
    if (Object.prototype.hasOwnProperty.call(rules, 'site')) {
      tasks.push(upsertStaticPage({
        slug: STATIC_PAGE_DEFS.rulesSite.slug,
        title: STATIC_PAGE_DEFS.rulesSite.title,
        content: rules.site,
        userId,
      }));
    }
    if (Object.prototype.hasOwnProperty.call(rules, 'communication')) {
      tasks.push(upsertStaticPage({
        slug: STATIC_PAGE_DEFS.rulesCommunication.slug,
        title: STATIC_PAGE_DEFS.rulesCommunication.title,
        content: rules.communication,
        userId,
      }));
    }
  }

  if (!tasks.length) return [];
  const result = await Promise.all(tasks);
  staticPagesCachePayload = null;
  staticPagesCacheAtMs = 0;
  return result;
}

module.exports = {
  STATIC_PAGE_DEFS,
  getStaticPagesContent,
  syncStaticPagesContent,
};

