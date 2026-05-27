const { createContentVersion, listContentVersions } = require('../../services/contentVersionService');
const { getSetting, setSetting } = require('../../utils/settings');
const {
  buildOperationId,
  getModelDocById,
  getUsersByIds,
  insertModelDoc,
  keywordArray,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  pickContentPreview,
  toDate,
  toId,
  toNumber,
  updateModelDoc,
} = require('./shared');

const LEGACY_PAGE_MIGRATION_KEY = 'CMS_LEGACY_PAGES_MIGRATED_V1';
let legacyPagesMigratedInProcess = false;

async function createPageVersion(doc, changedBy, changeNote) {
  if (!doc) return null;
  return createContentVersion({
    entityType: 'page',
    entityId: doc._id,
    snapshot: doc.toObject ? doc.toObject() : doc,
    changedBy,
    changeNote,
  });
}

async function createArticleVersion(doc, changedBy, changeNote) {
  if (!doc) return null;
  return createContentVersion({
    entityType: 'article',
    entityId: doc._id,
    snapshot: doc.toObject ? doc.toObject() : doc,
    changedBy,
    changeNote,
  });
}

function sanitizePagePayload(payload = {}) {
  const seo = payload.seo && typeof payload.seo === 'object' ? payload.seo : {};
  const translations = payload.translations && typeof payload.translations === 'object' ? payload.translations : {};
  const en = translations.en && typeof translations.en === 'object' ? translations.en : {};
  const enSeo = en.seo && typeof en.seo === 'object' ? en.seo : {};
  return {
    title: normalizeText(payload.title, 200),
    slug: normalizeText(payload.slug || seo.slug, 180).toLowerCase(),
    status: ['draft', 'published', 'archived'].includes(payload.status) ? payload.status : 'draft',
    content: payload.content ?? '',
    seo: {
      title: normalizeText(seo.title, 200),
      description: normalizeText(seo.description, 400),
      keywords: keywordArray(seo.keywords),
      slug: normalizeText(seo.slug || payload.slug, 180).toLowerCase(),
    },
    translations: {
      en: {
        title: normalizeText(en.title, 200),
        content: en.content ?? '',
        seo: {
          title: normalizeText(enSeo.title, 200),
          description: normalizeText(enSeo.description, 400),
        },
      },
    },
  };
}

function sanitizeArticlePayload(payload = {}) {
  const seo = payload.seo && typeof payload.seo === 'object' ? payload.seo : {};
  const translations = payload.translations && typeof payload.translations === 'object' ? payload.translations : {};
  const en = translations.en && typeof translations.en === 'object' ? translations.en : {};
  const enSeo = en.seo && typeof en.seo === 'object' ? en.seo : {};
  return {
    title: normalizeText(payload.title, 240),
    slug: normalizeText(payload.slug || seo.slug, 200).toLowerCase(),
    excerpt: normalizeText(payload.excerpt, 600),
    content: payload.content ?? '',
    categories: keywordArray(payload.categories),
    tags: keywordArray(payload.tags),
    status: ['draft', 'scheduled', 'published', 'archived'].includes(payload.status)
      ? payload.status
      : 'draft',
    scheduledAt: payload.scheduledAt ? toDate(payload.scheduledAt) : null,
    seo: {
      title: normalizeText(seo.title, 220),
      description: normalizeText(seo.description, 400),
      keywords: keywordArray(seo.keywords),
      slug: normalizeText(seo.slug || payload.slug, 200).toLowerCase(),
    },
    translations: {
      en: {
        title: normalizeText(en.title, 240),
        excerpt: normalizeText(en.excerpt, 600),
        content: en.content ?? '',
        seo: {
          title: normalizeText(enSeo.title, 220),
          description: normalizeText(enSeo.description, 400),
        },
      },
    },
  };
}

async function ensureLegacyPageTextMigrated() {
  if (legacyPagesMigratedInProcess) return;
  legacyPagesMigratedInProcess = true;
  try {
    const migrated = await getSetting(LEGACY_PAGE_MIGRATION_KEY, false);
    if (migrated) return;

    const [about, roadmapHtml, rulesBattle, rulesSite, rulesCommunication] = await Promise.all([
      getSetting('PAGE_ABOUT', ''),
      getSetting('PAGE_ROADMAP_HTML', ''),
      getSetting('RULES_BATTLE', ''),
      getSetting('RULES_SITE', ''),
      getSetting('RULES_COMMUNICATION', ''),
    ]);

    const pages = [
      { slug: 'about', title: 'О нас', content: String(about || '') },
      { slug: 'roadmap', title: 'Дорожная карта', content: String(roadmapHtml || '') },
      { slug: 'rules-battle', title: 'Правила боя', content: String(rulesBattle || '') },
      { slug: 'rules-site', title: 'Правила сайта', content: String(rulesSite || '') },
      { slug: 'rules-communication', title: 'Правила общения', content: String(rulesCommunication || '') },
    ];

    for (const row of pages) {
      if (!row.content.trim()) continue;
      // eslint-disable-next-line no-await-in-loop
      const existing = await listModelDocs('ContentPage', { pageSize: 2000 });
      const exists = (Array.isArray(existing) ? existing : []).some((p) => String(p?.slug || '') === String(row.slug));
      if (exists) continue;

      // eslint-disable-next-line no-await-in-loop
      await insertModelDoc('ContentPage', {
        title: row.title,
        slug: row.slug,
        status: 'published',
        content: row.content,
        seo: {
          title: row.title,
          description: '',
          keywords: [],
          slug: row.slug,
        },
        publishedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      });
    }

    await setSetting(
      LEGACY_PAGE_MIGRATION_KEY,
      true,
      'Legacy static pages migrated to CMS pages'
    );
  } catch (error) {
    // silent: migration should not break admin API
    console.error('Legacy pages migration error:', error?.message || error);
  } finally {
    legacyPagesMigratedInProcess = false;
  }
}

async function listPages(req, res) {
  try {
    await ensureLegacyPageTextMigrated();
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20 });
    const query = {};
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.slug) query.slug = String(req.query.slug).toLowerCase();

    const all = await listModelDocs('ContentPage', { pageSize: 2000 });
    const filtered = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.status && String(row?.status || '') !== String(query.status)) return false;
        if (query.slug && String(row?.slug || '').toLowerCase() !== String(query.slug).toLowerCase()) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
    const total = filtered.length;
    const safePages = filtered.slice(skip, skip + limit);

    const actorIds = Array.from(new Set(safePages
      .flatMap((row) => [toId(row?.createdBy), toId(row?.updatedBy)])
      .filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enrichedPages = safePages.map((row) => {
      const created = (() => {
        const id = toId(row?.createdBy);
        const u = id ? actorMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.createdBy;
      })();
      const updated = (() => {
        const id = toId(row?.updatedBy);
        const u = id ? actorMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.updatedBy;
      })();
      return {
        ...row,
        createdBy: created,
        updatedBy: updated,
      };
    });

    return res.json({
      pages: enrichedPages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createPage(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = sanitizePagePayload(req.body || {});
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ message: 'title и slug обязательны' });
    }

    const all = await listModelDocs('ContentPage', { pageSize: 2000 });
    const exists = (Array.isArray(all) ? all : []).some((row) => String(row?.slug || '') === String(payload.slug));
    if (exists) {
      return res.status(400).json({ message: 'Страница с таким slug уже существует' });
    }

    const now = new Date();
    const page = await insertModelDoc('ContentPage', {
      ...payload,
      publishedAt: payload.status === 'published' ? now : null,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    if (!page) return res.status(500).json({ message: 'Не удалось создать страницу' });

    await createPageVersion(page, req.user?._id || null, 'create');

    const auditId = await logCmsAudit(
      req,
      'cms.content.page.create',
      'ContentPage',
      page._id,
      null,
      page,
      { operationId },
      'high'
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Страница создана',
      data: { page },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchPage(req, res) {
  try {
    const operationId = buildOperationId();
    const pageDoc = await getModelDocById('ContentPage', req.params.id);
    if (!pageDoc) return res.status(404).json({ message: 'Страница не найдена' });

    const before = { ...pageDoc };
    const payload = sanitizePagePayload({ ...pageDoc, ...(req.body || {}) });

    const patch = {
      title: payload.title,
      slug: payload.slug,
      status: payload.status,
      content: payload.content,
      seo: payload.seo,
      translations: payload.translations,
      updatedBy: req.user?._id || null,
    };
    if (payload.status === 'published' && !pageDoc.publishedAt) patch.publishedAt = new Date();

    const saved = await updateModelDoc('ContentPage', req.params.id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить страницу' });

    await createPageVersion(saved, req.user?._id || null, 'update');

    const auditId = await logCmsAudit(
      req,
      'cms.content.page.update',
      'ContentPage',
      saved._id,
      before,
      saved,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Страница обновлена',
      data: { page: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function publishPage(req, res) {
  try {
    const operationId = buildOperationId();
    const page = await getModelDocById('ContentPage', req.params.id);
    if (!page) return res.status(404).json({ message: 'Страница не найдена' });

    const before = { ...page };
    const saved = await updateModelDoc('ContentPage', req.params.id, {
      status: 'published',
      publishedAt: new Date(),
      updatedBy: req.user?._id || null,
    });
    if (!saved) return res.status(500).json({ message: 'Не удалось опубликовать страницу' });

    await createPageVersion(saved, req.user?._id || null, 'publish');

    const auditId = await logCmsAudit(
      req,
      'cms.content.page.publish',
      'ContentPage',
      saved._id,
      before,
      saved,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Страница опубликована',
      data: { page: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function pageVersions(req, res) {
  try {
    const versions = await listContentVersions({
      entityType: 'page',
      entityId: req.params.id,
      limit: toNumber(req.query.limit, 50),
    });
    return res.json({ versions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function rollbackPage(req, res) {
  try {
    const operationId = buildOperationId();
    const page = await getModelDocById('ContentPage', req.params.id);
    if (!page) return res.status(404).json({ message: 'Страница не найдена' });

    const targetVersion = Number(req.params.version);
    const versions = await listContentVersions({ entityType: 'page', entityId: String(page._id), limit: 200 });
    const version = (Array.isArray(versions) ? versions : []).find((v) => Number(v?.version) === Number(targetVersion)) || null;
    if (!version) return res.status(404).json({ message: 'Версия не найдена' });

    const before = { ...page };
    await createPageVersion(page, req.user?._id || null, `rollback_before_${targetVersion}`);

    const snapshot = version.snapshot || {};
    const patch = {
      title: snapshot.title || page.title,
      slug: snapshot.slug || page.slug,
      status: snapshot.status || page.status,
      content: snapshot.content ?? page.content,
      seo: snapshot.seo || page.seo,
      translations: snapshot.translations || page.translations,
      publishedAt: snapshot.publishedAt || page.publishedAt,
      updatedBy: req.user?._id || null,
    };
    const saved = await updateModelDoc('ContentPage', req.params.id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось откатить страницу' });

    await createPageVersion(saved, req.user?._id || null, `rollback_to_${targetVersion}`);

    const auditId = await logCmsAudit(
      req,
      'cms.content.page.rollback',
      'ContentPage',
      saved._id,
      before,
      saved,
      { operationId, targetVersion },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Откат страницы выполнен',
      data: { page: saved, targetVersion },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listArticles(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20 });
    const query = {};
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.slug) query.slug = String(req.query.slug).toLowerCase();

    const all = await listModelDocs('ContentArticle', { pageSize: 2000 });
    const filtered = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.status && String(row?.status || '') !== String(query.status)) return false;
        if (query.slug && String(row?.slug || '').toLowerCase() !== String(query.slug).toLowerCase()) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    const total = filtered.length;
    const safeArticles = filtered.slice(skip, skip + limit);

    const actorIds = Array.from(new Set(safeArticles
      .flatMap((row) => [toId(row?.createdBy), toId(row?.updatedBy)])
      .filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enrichedArticles = safeArticles.map((row) => {
      const created = (() => {
        const id = toId(row?.createdBy);
        const u = id ? actorMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.createdBy;
      })();
      const updated = (() => {
        const id = toId(row?.updatedBy);
        const u = id ? actorMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.updatedBy;
      })();
      return {
        ...row,
        createdBy: created,
        updatedBy: updated,
      };
    });

    return res.json({
      articles: enrichedArticles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createArticle(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = sanitizeArticlePayload(req.body || {});
    if (!payload.title || !payload.slug) {
      return res.status(400).json({ message: 'title и slug обязательны' });
    }

    const all = await listModelDocs('ContentArticle', { pageSize: 2000 });
    const exists = (Array.isArray(all) ? all : []).some((row) => String(row?.slug || '') === String(payload.slug));
    if (exists) {
      return res.status(400).json({ message: 'Статья с таким slug уже существует' });
    }

    const now = new Date();
    const article = await insertModelDoc('ContentArticle', {
      ...payload,
      publishedAt: payload.status === 'published' ? now : null,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    if (!article) return res.status(500).json({ message: 'Не удалось создать статью' });

    await createArticleVersion(article, req.user?._id || null, 'create');

    const auditId = await logCmsAudit(
      req,
      'cms.content.article.create',
      'ContentArticle',
      article._id,
      null,
      article,
      { operationId },
      'high'
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Статья создана',
      data: { article },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchArticle(req, res) {
  try {
    const operationId = buildOperationId();
    const article = await getModelDocById('ContentArticle', req.params.id);
    if (!article) return res.status(404).json({ message: 'Статья не найдена' });

    const before = { ...article };
    const payload = sanitizeArticlePayload({ ...article, ...(req.body || {}) });

    const patch = {
      title: payload.title,
      slug: payload.slug,
      excerpt: payload.excerpt,
      content: payload.content,
      categories: payload.categories,
      tags: payload.tags,
      status: payload.status,
      scheduledAt: payload.scheduledAt,
      seo: payload.seo,
      translations: payload.translations,
      updatedBy: req.user?._id || null,
    };
    if (payload.status === 'published' && !article.publishedAt) patch.publishedAt = new Date();

    const saved = await updateModelDoc('ContentArticle', req.params.id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить статью' });

    await createArticleVersion(saved, req.user?._id || null, 'update');

    const auditId = await logCmsAudit(
      req,
      'cms.content.article.update',
      'ContentArticle',
      saved._id,
      before,
      saved,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Статья обновлена',
      data: { article: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function publishArticle(req, res) {
  try {
    const operationId = buildOperationId();
    const article = await getModelDocById('ContentArticle', req.params.id);
    if (!article) return res.status(404).json({ message: 'Статья не найдена' });

    const before = { ...article };
    const saved = await updateModelDoc('ContentArticle', req.params.id, {
      status: 'published',
      publishedAt: new Date(),
      updatedBy: req.user?._id || null,
    });
    if (!saved) return res.status(500).json({ message: 'Не удалось опубликовать статью' });

    await createArticleVersion(saved, req.user?._id || null, 'publish');

    const auditId = await logCmsAudit(
      req,
      'cms.content.article.publish',
      'ContentArticle',
      saved._id,
      before,
      saved,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Статья опубликована',
      data: { article: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function articleVersions(req, res) {
  try {
    const versions = await listContentVersions({
      entityType: 'article',
      entityId: req.params.id,
      limit: toNumber(req.query.limit, 50),
    });
    return res.json({ versions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function rollbackArticle(req, res) {
  try {
    const operationId = buildOperationId();
    const article = await getModelDocById('ContentArticle', req.params.id);
    if (!article) return res.status(404).json({ message: 'Статья не найдена' });

    const targetVersion = Number(req.params.version);
    const versions = await listContentVersions({ entityType: 'article', entityId: String(article._id), limit: 200 });
    const version = (Array.isArray(versions) ? versions : []).find((v) => Number(v?.version) === Number(targetVersion)) || null;
    if (!version) return res.status(404).json({ message: 'Версия не найдена' });

    const before = { ...article };
    await createArticleVersion(article, req.user?._id || null, `rollback_before_${targetVersion}`);

    const snapshot = version.snapshot || {};
    const patch = {
      title: snapshot.title || article.title,
      slug: snapshot.slug || article.slug,
      excerpt: snapshot.excerpt || article.excerpt,
      content: snapshot.content ?? article.content,
      categories: Array.isArray(snapshot.categories) ? snapshot.categories : article.categories,
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : article.tags,
      status: snapshot.status || article.status,
      scheduledAt: snapshot.scheduledAt || article.scheduledAt,
      publishedAt: snapshot.publishedAt || article.publishedAt,
      seo: snapshot.seo || article.seo,
      translations: snapshot.translations || article.translations,
      updatedBy: req.user?._id || null,
    };
    const saved = await updateModelDoc('ContentArticle', req.params.id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось откатить статью' });

    await createArticleVersion(saved, req.user?._id || null, `rollback_to_${targetVersion}`);

    const auditId = await logCmsAudit(
      req,
      'cms.content.article.rollback',
      'ContentArticle',
      saved._id,
      before,
      saved,
      { operationId, targetVersion },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Откат статьи выполнен',
      data: { article: saved, targetVersion },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

function matchesText(row, searchText) {
  if (!searchText) return true;
  const needle = searchText.toLowerCase();
  const translations = row?.translations && typeof row.translations === 'object' ? row.translations : {};
  const en = translations.en && typeof translations.en === 'object' ? translations.en : {};
  const enSeo = en.seo && typeof en.seo === 'object' ? en.seo : {};
  const values = [
    row.title,
    row.slug,
    row.excerpt,
    typeof row.content === 'string' ? row.content : JSON.stringify(row.content || {}),
    row?.seo?.title,
    row?.seo?.description,
    en.title,
    en.excerpt,
    typeof en.content === 'string' ? en.content : JSON.stringify(en.content || {}),
    enSeo.title,
    enSeo.description,
  ];
  return values.some((v) => String(v || '').toLowerCase().includes(needle));
}

async function contentSearch(req, res) {
  try {
    await ensureLegacyPageTextMigrated();
    const q = normalizeText(req.query.q || '', 200).toLowerCase();
    const status = req.query.status ? String(req.query.status) : '';
    const author = req.query.author ? String(req.query.author) : '';
    const dateFrom = toDate(req.query.dateFrom);
    const dateTo = toDate(req.query.dateTo);

    const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 1000));

    const [pageAll, articleAll] = await Promise.all([
      listModelDocs('ContentPage', { pageSize: 2000 }),
      listModelDocs('ContentArticle', { pageSize: 2000 }),
    ]);

    const filterByBase = (row) => {
      if (status && String(row?.status || '') !== status) return false;
      const createdAt = row?.createdAt ? new Date(row.createdAt) : null;
      if ((dateFrom || dateTo) && (!createdAt || Number.isNaN(createdAt.getTime()))) return false;
      if (dateFrom && createdAt.getTime() < dateFrom.getTime()) return false;
      if (dateTo && createdAt.getTime() > dateTo.getTime()) return false;
      return true;
    };

    const pageRowsRaw = (Array.isArray(pageAll) ? pageAll : []).filter(filterByBase).slice(0, limit);
    const articleRowsRaw = (Array.isArray(articleAll) ? articleAll : []).filter(filterByBase).slice(0, limit);
    const authorIds = Array.from(new Set([
      ...pageRowsRaw.map((row) => toId(row?.createdBy)),
      ...articleRowsRaw.map((row) => toId(row?.createdBy)),
    ].filter(Boolean)));
    const authorMap = await getUsersByIds(authorIds);

    const pagesEnriched = pageRowsRaw.map((row) => {
      const id = toId(row?.createdBy);
      const u = id ? authorMap.get(id) : null;
      return {
        ...row,
        createdBy: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.createdBy,
      };
    });
    const articlesEnriched = articleRowsRaw.map((row) => {
      const id = toId(row?.createdBy);
      const u = id ? authorMap.get(id) : null;
      return {
        ...row,
        createdBy: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.createdBy,
      };
    });

    const filterByCommon = (row) => {
      if (author) {
        const creator = row.createdBy;
        const text = `${creator?.nickname || ''} ${creator?.email || ''}`.toLowerCase();
        if (!text.includes(author.toLowerCase())) return false;
      }
      return true;
    };

    const pageRows = pagesEnriched
      .filter((row) => filterByCommon(row) && matchesText(row, q))
      .map((row) => ({
        type: 'page',
        id: row._id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: row.createdBy?.nickname || row.createdBy?.email || '-',
        preview: pickContentPreview(row.content),
      }));

    const articleRows = articlesEnriched
      .filter((row) => filterByCommon(row) && matchesText(row, q))
      .map((row) => ({
        type: 'article',
        id: row._id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: row.createdBy?.nickname || row.createdBy?.email || '-',
        preview: pickContentPreview(row.content),
      }));

    const rows = [...pageRows, ...articleRows].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return res.json({
      total: rows.length,
      rows,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  articleVersions,
  contentSearch,
  createArticle,
  createPage,
  listArticles,
  listPages,
  pageVersions,
  patchArticle,
  patchPage,
  publishArticle,
  publishPage,
  rollbackArticle,
  rollbackPage,
};
