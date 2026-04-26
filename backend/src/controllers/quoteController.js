const { getSupabaseClient } = require('../lib/supabaseClient');
const { adminAudit } = require('../middleware/adminAudit');
const { deleteQuoteTotally } = require('../services/adminCleanupService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const QUOTE_MODEL = 'Quote';

const ACTIVE_QUOTE_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.ACTIVE_QUOTE_CACHE_TTL_MS) || 15 * 1000
);
const activeQuoteCache = new Map();
const activeQuoteInflight = new Map();

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeQuoteText(value, maxLen = 5000) {
  return String(value ?? '').trim().slice(0, maxLen);
}

function normalizeQuoteTranslations(raw, existing = null) {
  const current = existing && typeof existing === 'object' ? existing : {};
  const previousEn = current.en && typeof current.en === 'object' ? current.en : {};
  const source = raw && typeof raw === 'object' ? raw : {};
  const enSource = source.en && typeof source.en === 'object' ? source.en : {};

  const nextEn = { ...previousEn };
  if (hasOwn(enSource, 'text')) {
    nextEn.text = normalizeQuoteText(enSource.text, 5000);
  }
  if (hasOwn(enSource, 'author')) {
    nextEn.author = normalizeQuoteText(enSource.author, 300);
  }

  return {
    ...current,
    en: nextEn,
  };
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

function getAdjustedDayOfWeek(now = new Date()) {
  const dayOfWeek = now.getDay();
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function getActiveQuoteCacheKey(dayOfWeek) {
  return String(dayOfWeek);
}

function getActiveQuoteCacheExpiry(now = new Date()) {
  const nowMs = now.getTime();
  const nextDayStart = new Date(nowMs);
  nextDayStart.setHours(24, 0, 0, 0);
  return Math.min(nowMs + ACTIVE_QUOTE_CACHE_TTL_MS, nextDayStart.getTime());
}

function getCachedActiveQuote(dayOfWeek, nowMs = Date.now()) {
  const cacheKey = getActiveQuoteCacheKey(dayOfWeek);
  if (!activeQuoteCache.has(cacheKey)) {
    return { hit: false, value: null };
  }

  const cached = activeQuoteCache.get(cacheKey);
  if (cached.expiresAt <= nowMs) {
    activeQuoteCache.delete(cacheKey);
    return { hit: false, value: null };
  }

  return { hit: true, value: cached.value };
}

function setCachedActiveQuote(dayOfWeek, value, now = new Date()) {
  const cacheKey = getActiveQuoteCacheKey(dayOfWeek);
  activeQuoteCache.set(cacheKey, {
    value,
    expiresAt: getActiveQuoteCacheExpiry(now),
  });
  return value;
}

function invalidateQuoteRuntimeState() {
  activeQuoteCache.clear();
  activeQuoteInflight.clear();
}

async function loadAllQuotes() {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = 1000;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', QUOTE_MODEL)
      .range(from, from + size - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += data.length;
  }
  return out;
}

async function loadActiveQuote(now = new Date()) {
  const adjustedDay = getAdjustedDayOfWeek(now);
  const cached = getCachedActiveQuote(adjustedDay, now.getTime());
  if (cached.hit) return cached.value;

  const cacheKey = getActiveQuoteCacheKey(adjustedDay);
  const inflight = activeQuoteInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = loadAllQuotes()
    .then((quotes) => {
      const match = quotes.find(
        (q) => q.isActive !== false && Number(q.dayOfWeek) === adjustedDay
      );
      return setCachedActiveQuote(adjustedDay, match || null, now);
    })
    .finally(() => {
      if (activeQuoteInflight.get(cacheKey) === promise) {
        activeQuoteInflight.delete(cacheKey);
      }
    });

  activeQuoteInflight.set(cacheKey, promise);
  return promise;
}

async function getAllQuotes(req, res) {
  try {
    const quotes = await loadAllQuotes();
    quotes.sort((a, b) => (Number(a.dayOfWeek) || 0) - (Number(b.dayOfWeek) || 0));
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function createQuote(req, res) {
  try {
    const text = normalizeQuoteText(req.body?.text, 5000);
    const author = normalizeQuoteText(req.body?.author, 300);
    const dayOfWeek = req.body?.dayOfWeek;
    const translations = normalizeQuoteTranslations(req.body?.translations);
    const supabase = getSupabaseClient();

    // Удаляем все цитаты с тем же dayOfWeek
    const existing = await loadAllQuotes();
    const toDelete = existing.filter((q) => Number(q.dayOfWeek) === Number(dayOfWeek));
    for (const q of toDelete) {
      // eslint-disable-next-line no-await-in-loop
      await supabase
        .from(DOC_TABLE)
        .delete()
        .eq('model', QUOTE_MODEL)
        .eq('id', String(q._id));
    }

    const id = `quote_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const doc = {
      text,
      author: author || '',
      translations,
      dayOfWeek: Number(dayOfWeek),
      isActive: true,
    };

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .insert({
        model: QUOTE_MODEL,
        id,
        data: doc,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id,data,created_at,updated_at')
      .maybeSingle();

    if (error) throw new Error(error.message);

    const quote = mapDocRow(data);
    invalidateQuoteRuntimeState();
    await adminAudit('quote.create', req, { text: text.substring(0, 50) + '...', dayOfWeek });
    res.status(201).json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function updateQuote(req, res) {
  try {
    const text = normalizeQuoteText(req.body?.text, 5000);
    const author = normalizeQuoteText(req.body?.author, 300);
    const supabase = getSupabaseClient();

    const { data: existing, error: readErr } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', QUOTE_MODEL)
      .eq('id', String(req.params.id))
      .maybeSingle();

    if (readErr || !existing) {
      return res.status(404).json({ message: 'Цитата не найдена' });
    }

    const current = existing.data && typeof existing.data === 'object' ? existing.data : {};
    const next = {
      ...current,
      text,
      author,
      translations: normalizeQuoteTranslations(req.body?.translations, current?.translations),
    };

    const { data, error } = await supabase
      .from(DOC_TABLE)
      .update({ data: next, updated_at: new Date().toISOString() })
      .eq('model', QUOTE_MODEL)
      .eq('id', String(req.params.id))
      .select('id,data,created_at,updated_at')
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ message: 'Цитата не найдена' });
    }

    invalidateQuoteRuntimeState();
    await adminAudit('quote.update', req, { id: req.params.id });
    res.json(mapDocRow(data));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function deleteQuote(req, res) {
  try {
    await deleteQuoteTotally(req.params.id);

    invalidateQuoteRuntimeState();
    await adminAudit('quote.delete', req, { id: req.params.id });
    res.json({ message: 'Цитата удалена' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
}

async function getActiveQuote(req, res) {
  try {
    const quote = await loadActiveQuote(new Date());
    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getActiveQuote,
  getAllQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  __resetQuoteControllerRuntimeState: invalidateQuoteRuntimeState,
};
