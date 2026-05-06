const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { listActivities } = require('../services/activityService');
const { listBackups } = require('../services/backupService');
const { clearCacheByZone } = require('../services/cacheService');
const {
  upsertIpRule,
  disableIpRule,
  recomputeRiskCases,
} = require('../services/securityService');
const { applyRiskPenalty } = require('../services/automationPenaltyService');
const {
  revokeSession,
  revokeAllUserSessions,
  writeAuthEvent,
} = require('../services/authTrackingService');
const {
  applyRiskCaseGroupDecision,
  getRiskCaseGroupUsers,
  getSignalHistoryForUsers,
  repairPendingMultiAccountRiskCases,
  sanitizeRewardRollbackEntries,
} = require('../services/multiAccountService');
const { invalidateModerationRulesCache } = require('../services/moderationFilterService');
const { createContentVersion, listContentVersions } = require('../services/contentVersionService');
const { createOperationApproval, serializeApproval } = require('../services/operationApprovalService');
const { logAdminAction } = require('../services/adminActionService');
const emailService = require('../services/emailService');
const { getSetting, setSetting } = require('../utils/settings');
const { normalizeLocalizedTextInput } = require('../utils/localizedContent');
const {
  getFortuneConfig,
  patchRouletteConfig,
  patchLotteryConfig,
} = require('../services/fortuneConfigService');
const { cleanupOldFortuneWins } = require('../services/fortuneWinLogService');
const fortuneController = require('./fortuneController');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function normalizeText(value, maxLen = 5000) {
  return String(value || '').trim().slice(0, maxLen);
}

function hasPopulatedUser(user) {
  return Boolean(
    user
      && typeof user === 'object'
      && (
        user._id
        || user.id
        || user.email
        || user.nickname
      )
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOperationId() {
  return `cms_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function mutationResponse({
  operationId = null,
  status = 'executed',
  auditId = null,
  message = '',
  data = null,
  requiresApproval = false,
}) {
  return {
    operationId,
    status,
    requiresApproval,
    auditId,
    message,
    ...(data !== null && data !== undefined ? { data } : {}),
  };
}

function parsePagination(query = {}, defaults = {}) {
  const page = Math.max(1, toNumber(query.page, defaults.page || 1));
  const limit = Math.max(1, Math.min(200, toNumber(query.limit, defaults.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function keywordArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[,"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  const head = headers.map((h) => csvEscape(h.label)).join(',');
  const lines = rows.map((row) => headers.map((h) => csvEscape(row[h.key])).join(','));
  return [head, ...lines].join('\n');
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

function getRiskCaseSource(row) {
  if (!row || typeof row !== 'object') return '';
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  return String(meta.source || '').trim();
}

function isMultiAccountRiskCase(row) {
  return getRiskCaseSource(row) === 'multi_account';
}

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : data.createdAt || null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : data.updatedAt || null,
  };
}

async function listModelDocs(model, { pageSize = 1000 } = {}) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', String(model))
      .range(from, from + size - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function getModelDocById(model, id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', String(model))
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function insertModelDoc(model, payload) {
  const supabase = getSupabaseClient();
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `${String(model)}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({ id, model: String(model), data: doc })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function updateModelDoc(model, id, patch) {
  const supabase = getSupabaseClient();
  const existing = await getModelDocById(model, id);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const next = { ...(existing || {}), ...(patch && typeof patch === 'object' ? patch : {}) };
  delete next._id;
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: next, updated_at: nowIso })
    .eq('model', String(model))
    .eq('id', String(id))
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function deleteModelDocs(model, ids) {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((v) => String(v || '').trim()).filter(Boolean)));
  if (!list.length) return;
  const supabase = getSupabaseClient();
  await supabase
    .from(DOC_TABLE)
    .delete()
    .eq('model', String(model))
    .in('id', list);
}

async function getUsersByIds(ids) {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)));
  const map = new Map();
  if (!list.length) return map;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,status,last_online_at,created_at')
    .in('id', list);
  if (!error && Array.isArray(data)) {
    data.forEach((row) => map.set(String(row.id), row));
  }
  return map;
}

async function sendCsvResponse(res, { headers, rows, mapRow, fileName }) {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const rowMapper = typeof mapRow === 'function' ? mapRow : ((row) => row || {});

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  res.write(`${safeHeaders.map((h) => csvEscape(h.label)).join(',')}\n`);

  for (const sourceRow of safeRows) {
    const row = rowMapper(sourceRow) || {};
    const line = `${safeHeaders.map((h) => csvEscape(row[h.key])).join(',')}\n`;
    if (!res.write(line)) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => res.once('drain', resolve));
    }
  }

  res.end();
}

async function logCmsAudit(req, actionType, entityType, entityId, before, after, meta, severity = 'normal') {
  const audit = await logAdminAction({
    req,
    actionType,
    entityType,
    entityId,
    before,
    after,
    meta,
    severity,
    source: 'admin_cms',
  });
  return audit?.actionLogId || audit?.auditId || null;
}

function getPeriodWindow(period = 'day', offset = 0) {
  const now = new Date();
  const safePeriod = ['day', 'week', 'month'].includes(period) ? period : 'day';

  let durationMs = 24 * 60 * 60 * 1000;
  if (safePeriod === 'week') durationMs = 7 * durationMs;
  if (safePeriod === 'month') durationMs = 30 * durationMs;

  const end = new Date(now.getTime() - offset * durationMs);
  const start = new Date(end.getTime() - durationMs);
  return { start, end, durationMs, period: safePeriod };
}

function withDateRange(query, start, end) {
  const out = { ...(query || {}) };
  out.createdAt = { $gte: start, $lt: end };
  return out;
}

function pickContentPreview(content) {
  if (typeof content === 'string') return content.slice(0, 120);
  try {
    return JSON.stringify(content).slice(0, 120);
  } catch (_err) {
    return '';
  }
}

async function importEmailTemplateDefaults(req, res) {
  try {
    const operationId = buildOperationId();

    const defaults = [
      {
        key: 'registration_confirm',
        name: 'Подтверждение регистрации',
        subject: { ru: 'Подтверждение регистрации GIVKOIN', en: 'GIVKOIN Registration Confirmation' },
        html: {
          ru: '<h2>Подтверждение регистрации</h2>\n<p>Привет, <strong>{{nickname}}</strong>!</p>\n<p>Спасибо за регистрацию. Подтвердите email, чтобы активировать аккаунт.</p>\n<p><a href="{{confirmLink}}">Подтвердить email</a></p>',
          en: '<h2>Registration confirmation</h2>\n<p>Hi, <strong>{{nickname}}</strong>!</p>\n<p>Thanks for signing up. Please confirm your email to activate your account.</p>\n<p><a href="{{confirmLink}}">Confirm email</a></p>',
        },
        text: {
          ru: 'Привет, {{nickname}}! Подтвердите email: {{confirmLink}}',
          en: 'Hi, {{nickname}}! Please confirm your email: {{confirmLink}}',
        },
      },
      {
        key: 'complaint_notification',
        name: 'Уведомление о жалобе',
        subject: { ru: 'На вас поступила жалоба в GIVKOIN', en: 'A complaint has been filed in GIVKOIN' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>На ваш недавний чат поступила жалоба. У вас есть {{hoursToRespond}} часов, чтобы оспорить решение.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>A complaint has been filed about your recent chat. You have {{hoursToRespond}} hours to appeal the decision.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Жалоба на чат. У вас есть {{hoursToRespond}} часов, чтобы оспорить решение.',
          en: 'Hello, {{nickname}}! A complaint has been filed. You have {{hoursToRespond}} hours to appeal.',
        },
      },
      {
        key: 'ban_outcome',
        name: 'Итог по бану',
        subject: { ru: 'Итог модерации в GIVKOIN', en: 'Moderation result in GIVKOIN' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>{{message}}</p>\n<ul>\n<li>Жизней осталось: {{lives}}</li>\n<li>Звёзды душевности: {{stars}}</li>\n<li>Дебафф: {{debuffPercent}}%</li>\n</ul>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>{{message}}</p>\n<ul>\n<li>Lives remaining: {{lives}}</li>\n<li>Warmth stars: {{stars}}</li>\n<li>Debuff: {{debuffPercent}}%</li>\n</ul>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! {{message}} (Жизни: {{lives}}, Звёзды: {{stars}}, Дебафф: {{debuffPercent}}%)',
          en: 'Hello, {{nickname}}! {{message}} (Lives: {{lives}}, Stars: {{stars}}, Debuff: {{debuffPercent}}%)',
        },
      },
      {
        key: 'battle_result',
        name: 'Итог боя',
        subject: { ru: 'Итог боя GIVKOIN', en: 'GIVKOIN Battle Results' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>{{outcome}}</p>\n<ul>\n<li>Урон Света: {{damageLight}}</li>\n<li>Урон Мрака: {{damageDark}}</li>\n</ul>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>{{outcome}}</p>\n<ul>\n<li>Light damage: {{damageLight}}</li>\n<li>Darkness damage: {{damageDark}}</li>\n</ul>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! {{outcome}} Урон Света: {{damageLight}}, Урон Мрака: {{damageDark}}',
          en: 'Hello, {{nickname}}! {{outcome}} Light: {{damageLight}}, Dark: {{damageDark}}',
        },
      },
      {
        key: 'lottery_win',
        name: 'Выигрыш в лотерее',
        subject: { ru: 'Вы выиграли в лотерее GIVKOIN', en: 'You won the GIVKOIN lottery' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Вы выиграли приз: <strong>{{prize}}</strong>.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>You won a prize: <strong>{{prize}}</strong>.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Вы выиграли приз: {{prize}}',
          en: 'Hello, {{nickname}}! You won a prize: {{prize}}',
        },
      },
      {
        key: 'stars_milestone',
        name: 'Достижение по звёздам',
        subject: { ru: 'Поздравляем! {{stars}} звёзд душевности', en: 'Congratulations! {{stars}} warmth stars' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Вы достигли {{stars}} звёзд душевности.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>You reached {{stars}} warmth stars.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Вы достигли {{stars}} звёзд душевности.',
          en: 'Hello, {{nickname}}! You reached {{stars}} warmth stars.',
        },
      },
      {
        key: 'password_recovery',
        name: 'Восстановление пароля',
        subject: { ru: 'Восстановление пароля GIVKOIN', en: 'GIVKOIN Password recovery' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Вы запросили восстановление пароля.</p>\n<p><a href="{{resetLink}}">Сбросить пароль</a></p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>You requested a password reset.</p>\n<p><a href="{{resetLink}}">Reset password</a></p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Ссылка для сброса пароля: {{resetLink}}',
          en: 'Hello, {{nickname}}! Password reset link: {{resetLink}}',
        },
      },
      {
        key: 'darkness_attack',
        name: 'Атака Мрака (старт боя)',
        subject: { ru: 'Мрак напал на Древо — срочно заходите в бой', en: 'Darkness attacked the Tree — enter the battle now' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Мрак напал на Древо. Срочно заходите в бой:</p>\n<p><a href="{{battleUrl}}">{{battleUrl}}</a></p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>Darkness attacked the Tree. Enter the battle now:</p>\n<p><a href="{{battleUrl}}">{{battleUrl}}</a></p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Мрак напал на Древо. Ссылка на бой: {{battleUrl}}',
          en: 'Hello, {{nickname}}! Darkness attacked the Tree. Battle link: {{battleUrl}}',
        },
      },
      {
        key: 'solar_charge_reminder',
        name: 'Напоминание о солнечном заряде',
        subject: { ru: 'Напоминание о солнечном заряде - GIVKOIN', en: 'Solar charge reminder - GIVKOIN' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Напоминание: не забудьте про солнечный заряд.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>Reminder: don’t forget about your solar charge.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Напоминание: не забудьте про солнечный заряд.',
          en: 'Hello, {{nickname}}! Reminder: don’t forget about your solar charge.',
        },
      },
      {
        key: 'unstable_connection_penalty',
        name: 'Штраф за нестабильное соединение',
        subject: { ru: 'Штраф за нестабильное соединение - GIVKOIN', en: 'Unstable connection penalty - GIVKOIN' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Система зафиксировала нестабильное соединение. Возможен штраф по правилам проекта.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>The system detected an unstable connection. A penalty may be applied according to the project rules.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Система зафиксировала нестабильное соединение. Возможен штраф.',
          en: 'Hello, {{nickname}}! The system detected an unstable connection. A penalty may be applied.',
        },
      },
      {
        key: 'night_shift_penalty',
        name: 'Штраф за ночную смену',
        subject: { ru: 'Штраф за Ночную Смену в GIVKOIN', en: 'Night Shift penalty in GIVKOIN' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>По итогам ночной смены был применён штраф согласно правилам.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>A Night Shift penalty has been applied according to the rules.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! По итогам ночной смены был применён штраф.',
          en: 'Hello, {{nickname}}! A Night Shift penalty has been applied.',
        },
      },
      {
        key: 'multi_account_review',
        name: 'Проверка мульти-аккаунтов',
        subject: { ru: 'Проверка аккаунта - GIVKOIN', en: 'Account review - GIVKOIN' },
        html: {
          ru: '<h2>Здравствуйте, {{nickname}}!</h2>\n<p>Система обнаружила возможные связанные аккаунты. Количество: <strong>{{clusterSize}}</strong>.</p>\n<p>Администрация свяжется с вами с дальнейшими инструкциями.</p>',
          en: '<h2>Hello, {{nickname}}!</h2>\n<p>The system detected possible linked accounts. Count: <strong>{{clusterSize}}</strong>.</p>\n<p>Administration will contact you with further instructions.</p>',
        },
        text: {
          ru: 'Здравствуйте, {{nickname}}! Обнаружены возможные связанные аккаунты. Количество: {{clusterSize}}.',
          en: 'Hello, {{nickname}}! Possible linked accounts detected. Count: {{clusterSize}}.',
        },
      },
    ];

    const existing = await listModelDocs('EmailTemplate', { pageSize: 2000 });
    const existingKeys = new Set((Array.isArray(existing) ? existing : []).map((row) => String(row?.key || '')).filter(Boolean));

    const created = [];
    const skipped = [];

    for (const item of defaults) {
      const key = String(item.key || '').trim();
      if (!key) continue;
      if (existingKeys.has(key)) {
        skipped.push(key);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const template = await insertModelDoc('EmailTemplate', {
        key,
        name: String(item.name || key),
        status: 'published',
        subject: normalizeLocalizedTextInput(item.subject, ''),
        html: normalizeLocalizedTextInput(item.html, ''),
        text: normalizeLocalizedTextInput(item.text, ''),
        note: 'import-defaults',
        publishedAt: new Date(),
        createdBy: req.user?._id || null,
        updatedBy: req.user?._id || null,
      });

      if (template) {
        // eslint-disable-next-line no-await-in-loop
        await createEmailTemplateVersion(template, req.user?._id || null, 'import-defaults');
        created.push(template);
        existingKeys.add(key);
      }
    }

    const auditId = await logCmsAudit(
      req,
      'cms.mail.template.import-defaults',
      'EmailTemplate',
      null,
      null,
      null,
      {
        operationId,
        created: created.map((t) => ({ _id: t._id, key: t.key })),
        skipped,
      },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: `Импорт выполнен. Создано: ${created.length}. Пропущено: ${skipped.length}.`,
      data: { created, skipped },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listEmailTemplates(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const query = {};
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.key) query.key = String(req.query.key);

    const all = await listModelDocs('EmailTemplate', { pageSize: 2000 });
    const filtered = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.status && String(row?.status || '') !== String(query.status)) return false;
        if (query.key && String(row?.key || '') !== String(query.key)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    const total = filtered.length;
    const safeRows = filtered.slice(skip, skip + limit);

    const actorIds = Array.from(new Set(safeRows
      .flatMap((row) => [toId(row?.createdBy), toId(row?.updatedBy)])
      .filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enriched = safeRows.map((row) => {
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
      return { ...row, createdBy: created, updatedBy: updated };
    });

    return res.json({
      templates: enriched,
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

async function createEmailTemplate(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = sanitizeEmailTemplatePayload(req.body || {});
    if (!payload.key) {
      return res.status(400).json({ message: 'key обязателен' });
    }

    const all = await listModelDocs('EmailTemplate', { pageSize: 2000 });
    const exists = (Array.isArray(all) ? all : []).some((row) => String(row?.key || '') === String(payload.key));
    if (exists) {
      return res.status(400).json({ message: 'Шаблон с таким key уже существует' });
    }

    const template = await insertModelDoc('EmailTemplate', {
      ...payload,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
      publishedAt: payload.status === 'published' ? new Date() : null,
    });
    if (!template) return res.status(500).json({ message: 'Не удалось создать шаблон' });

    await createEmailTemplateVersion(template, req.user?._id || null, 'create');

    const auditId = await logCmsAudit(
      req,
      'cms.mail.template.create',
      'EmailTemplate',
      template._id,
      null,
      template,
      { operationId },
      'high'
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Шаблон создан',
      data: { template },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchEmailTemplate(req, res) {
  try {
    const operationId = buildOperationId();
    const doc = await getModelDocById('EmailTemplate', req.params.id);
    if (!doc) return res.status(404).json({ message: 'Шаблон не найден' });

    const before = { ...doc };
    const payload = sanitizeEmailTemplatePayload({ ...doc, ...(req.body || {}) });

    const patch = {
      key: payload.key,
      name: payload.name,
      status: payload.status,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      note: payload.note,
      updatedBy: req.user?._id || null,
    };

    const saved = await updateModelDoc('EmailTemplate', req.params.id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить шаблон' });

    await createEmailTemplateVersion(saved, req.user?._id || null, 'update');

    const auditId = await logCmsAudit(
      req,
      'cms.mail.template.update',
      'EmailTemplate',
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
      message: 'Шаблон обновлен',
      data: { template: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function publishEmailTemplate(req, res) {
  try {
    const operationId = buildOperationId();
    const doc = await getModelDocById('EmailTemplate', req.params.id);
    if (!doc) return res.status(404).json({ message: 'Шаблон не найден' });

    const before = { ...doc };
    const saved = await updateModelDoc('EmailTemplate', req.params.id, {
      status: 'published',
      publishedAt: new Date(),
      updatedBy: req.user?._id || null,
    });
    if (!saved) return res.status(500).json({ message: 'Не удалось опубликовать шаблон' });

    await createEmailTemplateVersion(saved, req.user?._id || null, 'publish');

    const auditId = await logCmsAudit(
      req,
      'cms.mail.template.publish',
      'EmailTemplate',
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
      message: 'Шаблон опубликован',
      data: { template: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function emailTemplateVersions(req, res) {
  try {
    const versions = await listContentVersions({
      entityType: 'email_template',
      entityId: req.params.id,
      limit: toNumber(req.query.limit, 50),
    });
    return res.json({ versions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function rollbackEmailTemplate(req, res) {
  try {
    const operationId = buildOperationId();
    const doc = await getModelDocById('EmailTemplate', req.params.id);
    if (!doc) return res.status(404).json({ message: 'Шаблон не найден' });

    const targetVersion = Number(req.params.version);
    const versions = await listContentVersions({ entityType: 'email_template', entityId: String(doc._id), limit: 200 });
    const version = (Array.isArray(versions) ? versions : []).find((v) => Number(v?.version) === Number(targetVersion)) || null;
    if (!version) return res.status(404).json({ message: 'Версия не найдена' });

    const before = { ...doc };
    await createEmailTemplateVersion(doc, req.user?._id || null, `rollback_before_${targetVersion}`);

    const snapshot = version.snapshot || {};
    const patch = {
      key: snapshot.key || doc.key,
      name: snapshot.name || doc.name,
      status: snapshot.status || doc.status,
      subject: snapshot.subject || doc.subject,
      html: snapshot.html || doc.html,
      text: snapshot.text || doc.text,
      note: snapshot.note || doc.note,
      publishedAt: snapshot.publishedAt || doc.publishedAt,
      updatedBy: req.user?._id || null,
    };

    const saved = await updateModelDoc('EmailTemplate', req.params.id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось откатить шаблон' });

    await createEmailTemplateVersion(saved, req.user?._id || null, `rollback_to_${targetVersion}`);

    const auditId = await logCmsAudit(
      req,
      'cms.mail.template.rollback',
      'EmailTemplate',
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
      message: 'Откат выполнен',
      data: { template: saved, targetVersion },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

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

const LEGACY_PAGE_MIGRATION_KEY = 'CMS_LEGACY_PAGES_MIGRATED_V1';
let legacyPagesMigratedInProcess = false;

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

async function listRiskCases(req, res) {
  try {
    await repairPendingMultiAccountRiskCases();

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20 });
    const requestedStatus = req.query.status ? String(req.query.status) : '';

    const allRows = await listModelDocs('RiskCase');
    const filtered = allRows.filter((row) => {
      if (!row) return false;
      if (!isMultiAccountRiskCase(row)) return false;
      // Скрываем закрытые кейсы из списка (если не запрошен конкретный статус)
      const hiddenStatuses = ['resolved', 'false_positive', 'ignored'];
      if (!requestedStatus && hiddenStatuses.includes(String(row.status))) return false;
      if (requestedStatus && String(row.status) !== requestedStatus) return false;
      if (req.query.riskLevel && String(row.riskLevel) !== String(req.query.riskLevel)) return false;

      const riskScore = Number(row.riskScore || 0);
      if (String(req.query.includeZero || '').toLowerCase() !== 'true') {
        if (!(riskScore > 0 || String(row.freezeStatus || '') === 'banned')) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const left = Number(b?.riskScore || 0) - Number(a?.riskScore || 0);
      if (left !== 0) return left;
      return new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime();
    });

    const total = filtered.length;
    const rows = filtered.slice(skip, skip + limit);

    const safeRows = Array.isArray(rows) ? rows : [];

    const userIds = Array.from(new Set(safeRows
      .flatMap((row) => [toId(row?.user), ...(Array.isArray(row?.relatedUsers) ? row.relatedUsers.map((u) => toId(u)) : [])])
      .filter(Boolean)));
    const userMap = await getUsersByIds(userIds);

    const orphanIds = safeRows
      .filter((row) => {
        const uid = toId(row?.user);
        return !uid || !userMap.has(uid);
      })
      .map((row) => row?._id)
      .filter(Boolean);

    if (orphanIds.length) {
      await deleteModelDocs('RiskCase', orphanIds);
    }

    const visibleRows = safeRows
      .filter((row) => {
        const uid = toId(row?.user);
        return uid && userMap.has(uid);
      })
      .map((row) => {
        const uid = toId(row?.user);
        const user = uid ? userMap.get(uid) : null;
        const relatedUsers = Array.isArray(row?.relatedUsers)
          ? row.relatedUsers
            .map((rid) => {
              const id = toId(rid);
              const u = id ? userMap.get(id) : null;
              if (!u) return null;
              return { _id: u.id, email: u.email, nickname: u.nickname, status: u.status };
            })
            .filter(Boolean)
          : [];
        return {
          ...row,
          user: user ? { _id: user.id, email: user.email, nickname: user.nickname, status: user.status } : null,
          relatedUsers,
        };
      });

    const adjustedTotal = Math.max(0, Number(total || 0) - orphanIds.length);

    return res.json({
      riskCases: visibleRows,
      pagination: {
        page,
        limit,
        total: adjustedTotal,
        totalPages: Math.ceil(adjustedTotal / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getRiskCase(req, res) {
  try {
    await repairPendingMultiAccountRiskCases();

    const row = await getModelDocById('RiskCase', req.params.id);
    if (!row || !isMultiAccountRiskCase(row)) {
      return res.status(404).json({ message: 'Случай мультиаккаунта не найден' });
    }

    const uid = toId(row.user);
    const relatedIds = Array.isArray(row.relatedUsers) ? row.relatedUsers.map((u) => toId(u)).filter(Boolean) : [];
    const appliedById = toId(row?.penalty?.appliedBy);
    const usersMap = await getUsersByIds([uid, ...relatedIds, appliedById].filter(Boolean));
    const mainUser = uid ? usersMap.get(uid) : null;
    if (!mainUser) {
      await deleteModelDocs('RiskCase', [row._id]);
      return res.status(404).json({ message: 'Риск-кейс удалён вместе с пользователем' });
    }

    const penaltyLedger = row?.penalty?.ledgerId
      ? await getModelDocById('AutomationPenalty', row.penalty.ledgerId)
      : null;

    if (penaltyLedger) {
      const ledgerAppliedById = toId(penaltyLedger?.appliedBy);
      if (ledgerAppliedById && !usersMap.has(ledgerAppliedById)) {
        const extra = await getUsersByIds([ledgerAppliedById]);
        extra.forEach((v, k) => usersMap.set(k, v));
      }
    }

    const relatedUsers = relatedIds
      .map((id) => {
        const u = usersMap.get(String(id));
        if (!u) return null;
        return { _id: u.id, email: u.email, nickname: u.nickname, status: u.status };
      })
      .filter(Boolean);

    const penaltyAppliedBy = appliedById ? usersMap.get(appliedById) : null;
    const enrichedPenalty = row?.penalty && typeof row.penalty === 'object'
      ? {
        ...row.penalty,
        appliedBy: penaltyAppliedBy ? { _id: penaltyAppliedBy.id, email: penaltyAppliedBy.email, nickname: penaltyAppliedBy.nickname } : row.penalty.appliedBy,
      }
      : row.penalty;

    const enrichedLedger = penaltyLedger && typeof penaltyLedger === 'object'
      ? {
        ...penaltyLedger,
        appliedBy: (() => {
          const id = toId(penaltyLedger.appliedBy);
          const u = id ? usersMap.get(id) : null;
          return u ? { _id: u.id, email: u.email, nickname: u.nickname } : penaltyLedger.appliedBy;
        })(),
      }
      : penaltyLedger;

    const groupUserIds = Array.from(new Set([uid, ...relatedIds].filter(Boolean)));
    const signalHistory = await getSignalHistoryForUsers(groupUserIds, { limit: 120 });
    const groupedHistory = signalHistory.map((entry) => {
      const historyUser = entry?.userId ? usersMap.get(String(entry.userId)) : null;
      return {
        ...entry,
        user: historyUser ? { _id: historyUser.id, email: historyUser.email, nickname: historyUser.nickname, status: historyUser.status } : null,
      };
    });

    return res.json({
      riskCase: {
        ...row,
        rewardRollback: sanitizeRewardRollbackEntries(
          Array.isArray(row?.rewardRollback) ? row.rewardRollback : [],
          Array.isArray(row?.evidence) ? row.evidence : (Array.isArray(row?.riskScoreDetailed) ? row.riskScoreDetailed : []),
          usersMap
        ),
        user: { _id: mainUser.id, email: mainUser.email, nickname: mainUser.nickname, status: mainUser.status },
        relatedUsers: relatedIds,
        relatedUsersData: relatedUsers,
        penalty: enrichedPenalty,
      },
      penaltyLedger: enrichedLedger,
      signalHistory: groupedHistory,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function applyRiskCasePenalty(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const force = Boolean(req.body?.force);
    const reason = normalizeText(req.body?.reason || '', 1000);
    const penaltyPercent = toNumber(req.body?.penaltyPercent, 80);

    const before = await getModelDocById('RiskCase', riskCaseId);
    const result = await applyRiskPenalty({
      riskCaseId,
      actorId: req.user?._id || null,
      reason,
      force,
      penaltyPercent,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.penalize',
      'RiskCase',
      riskCaseId,
      before,
      after,
      {
        operationId,
        force,
        penaltyPercent,
        result: result.result,
      },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Штраф по риск-кейсу применён',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function resolveRiskCase(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const resolution = String(req.body?.resolution || 'resolved');
    const note = normalizeText(req.body?.note || '', 1000);

    if (!['resolved', 'false_positive', 'ignored'].includes(resolution)) {
      return res.status(400).json({ message: 'Неверный тип решения' });
    }

    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    if (before.status === 'penalized') {
      return res.status(400).json({ message: 'Нельзя изменить оштрафованный кейс' });
    }

    const nowIso = new Date().toISOString();
    const prevNotes = String(before.notes || '').trim();
    const newNote = `[${nowIso}] admin_resolved:${resolution}${note ? ` note:${note}` : ''}`;

    const after = await updateModelDoc('RiskCase', riskCaseId, {
      status: resolution,
      notes: prevNotes ? `${prevNotes}\n${newNote}` : newNote,
      resolvedBy: req.user?._id || null,
      resolvedAt: nowIso,
      resolutionNote: note,
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.resolve',
      'RiskCase',
      riskCaseId,
      before,
      after,
      {
        operationId,
        resolution,
        note,
      },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: resolution === 'false_positive' ? 'Риск-кейс отмечен как ложное срабатывание' : 'Риск-кейс снят',
      data: { riskCase: after },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function deleteRiskCase(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;

    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    if (before.status === 'penalized') {
      return res.status(400).json({ message: 'Нельзя удалить оштрафованный кейс' });
    }

    await deleteModelDocs('RiskCase', [riskCaseId]);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.delete',
      'RiskCase',
      riskCaseId,
      before,
      null,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Риск-кейс удалён',
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function recomputeRisk(req, res) {
  try {
    const operationId = buildOperationId();
    const result = await recomputeRiskCases();

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.recompute',
      'RiskCase',
      null,
      null,
      result,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Риск-кейсы пересчитаны',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function removeRelatedUserFromRiskCase(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const userIdToRemove = req.params?.userId;

    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    if (before.status === 'penalized') {
      return res.status(400).json({ message: 'Нельзя изменять оштрафованный кейс' });
    }

    const relatedUsers = Array.isArray(before.relatedUsers) ? before.relatedUsers : [];
    const newRelatedUsers = relatedUsers.filter((id) => String(id) !== String(userIdToRemove));

    if (newRelatedUsers.length === relatedUsers.length) {
      return res.status(400).json({ message: 'Пользователь не найден в списке связанных' });
    }

    const nowIso = new Date().toISOString();
    const prevNotes = String(before.notes || '').trim();
    const newNote = `[${nowIso}] admin_removed_user:${userIdToRemove}`;

    const after = await updateModelDoc('RiskCase', riskCaseId, {
      relatedUsers: newRelatedUsers,
      notes: prevNotes ? `${prevNotes}\n${newNote}` : newNote,
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.remove_user',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, removedUserId: userIdToRemove },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Пользователь удалён из кейса',
      data: { riskCase: after },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function unfreezeRiskCaseGroup(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const note = normalizeText(req.body?.note || '', 1000);
    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) return res.status(404).json({ message: 'Риск-кейс не найден' });
    if (!isMultiAccountRiskCase(before)) {
      return res.status(400).json({ message: 'Эта карточка не относится к мультиаккаунтам' });
    }

    const result = await applyRiskCaseGroupDecision({
      riskCaseId,
      actorId: req.user?._id || null,
      decision: 'unfreeze',
      note,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.group_unfreeze',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, note, result },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Группа разморожена',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function watchRiskCaseGroup(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const note = normalizeText(req.body?.note || '', 1000);
    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) return res.status(404).json({ message: 'Риск-кейс не найден' });
    if (!isMultiAccountRiskCase(before)) {
      return res.status(400).json({ message: 'Эта карточка не относится к мультиаккаунтам' });
    }

    const result = await applyRiskCaseGroupDecision({
      riskCaseId,
      actorId: req.user?._id || null,
      decision: 'watch',
      note,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.group_watch',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, note, result },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Группа переведена под наблюдение',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function banRiskCaseGroup(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const note = normalizeText(req.body?.note || '', 1000);
    const before = await getModelDocById('RiskCase', riskCaseId);
    if (!before) return res.status(404).json({ message: 'Риск-кейс не найден' });
    if (!isMultiAccountRiskCase(before)) {
      return res.status(400).json({ message: 'Эта карточка не относится к мультиаккаунтам' });
    }

    const result = await applyRiskCaseGroupDecision({
      riskCaseId,
      actorId: req.user?._id || null,
      decision: 'ban',
      note,
    });
    const after = await getModelDocById('RiskCase', riskCaseId);

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.group_ban',
      'RiskCase',
      riskCaseId,
      before,
      after,
      { operationId, note, result },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Группа заблокирована',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function sendRiskCaseContactEmail(req, res) {
  try {
    const operationId = buildOperationId();
    const riskCaseId = req.params?.id;
    const riskCase = await getModelDocById('RiskCase', riskCaseId);

    if (!riskCase) {
      return res.status(404).json({ message: 'Риск-кейс не найден' });
    }

    const uid = toId(riskCase.user);
    const relatedIds = Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers.map((u) => toId(u)).filter(Boolean) : [];
    const usersMap = await getUsersByIds([uid, ...relatedIds].filter(Boolean));
    const user = uid ? usersMap.get(uid) : null;
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'У пользователя нет email для отправки письма' });
    }

    const subject = normalizeText(
      req.body?.subject || 'Пожалуйста, выберите основной аккаунт в GIVKOIN',
      200
    );
    const customMessage = normalizeText(req.body?.message || '', 5000);
    const relatedRows = relatedIds
      .map((id) => usersMap.get(String(id)))
      .filter(Boolean);
    const relatedHtml = relatedRows.length
      ? `<ul>${relatedRows
        .map((row) => {
          const nickname = escapeHtml(row?.nickname || 'Без ника');
          const mail = escapeHtml(row?.email || 'без email');
          return `<li>${nickname} (${mail})</li>`;
        })
        .join('')}</ul>`
      : '<p>Связанные аккаунты не найдены.</p>';

    const messageHtml = customMessage
      ? `<p>${escapeHtml(customMessage).replace(/\n/g, '<br/>')}</p>`
      : `<p>Система безопасности обнаружила несколько аккаунтов, связанных с вашим устройством/сигнатурой.</p>
         <p>Пожалуйста, ответьте на это письмо и укажите, какой аккаунт нужно оставить основным. Второй аккаунт будет удален только после вашего подтверждения.</p>`;

    const html = `
      <h2>Здравствуйте, ${escapeHtml(user?.nickname || 'пользователь')}!</h2>
      ${messageHtml}
      <p><strong>Связанные аккаунты:</strong></p>
      ${relatedHtml}
      <p>Пока идет проверка, действия по удалению аккаунтов не выполняются автоматически.</p>
    `;

    await emailService.sendGenericEventEmail(email, subject, html);

    const before = { ...riskCase };
    const nextUpdate = {};
    if (['open', 'resolved'].includes(String(riskCase.status))) {
      nextUpdate.status = isMultiAccountRiskCase(riskCase) ? 'watch' : 'review';
    }
    const note = `[${new Date().toISOString()}] admin_contact_sent:${subject}`;
    const prevNotes = String(riskCase.notes || '').trim();
    nextUpdate.notes = prevNotes ? `${prevNotes}\n${note}` : note;
    nextUpdate.meta = {
      ...(riskCase.meta && typeof riskCase.meta === 'object' ? riskCase.meta : {}),
      lastContactAt: new Date(),
      lastContactBy: req.user?._id || null,
      lastContactSubject: subject,
    };
    await updateModelDoc('RiskCase', riskCase._id, nextUpdate);
    const after = await getModelDocById('RiskCase', riskCase._id);

    await writeAuthEvent({
      user: uid || null,
      email,
      eventType: 'multi_account_contacted',
      result: 'success',
      reason: 'admin_requested_account_choice',
      req,
      meta: {
        riskCaseId: riskCase._id,
        operationId,
      },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.contact_user',
      'RiskCase',
      riskCase._id,
      before,
      after || nextUpdate,
      { operationId, subject },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Письмо пользователю отправлено',
      data: { riskCaseId: riskCase._id, email, subject },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function sendRiskGroupContactEmail(req, res) {
  try {
    const operationId = buildOperationId();
    const rawEmails = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = Array.from(
      new Set(
        rawEmails
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (!emails.length) {
      return res.status(400).json({ message: 'Список получателей пустой' });
    }

    const subject = normalizeText(
      req.body?.subject || 'Пожалуйста, выберите основной аккаунт в GIVKOIN',
      200
    );
    const customMessage = normalizeText(req.body?.message || '', 5000);
    const riskCaseIds = Array.isArray(req.body?.riskCaseIds)
      ? req.body.riskCaseIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

    const messageHtml = customMessage
      ? `<p>${escapeHtml(customMessage).replace(/\n/g, '<br/>')}</p>`
      : `<p>Система безопасности обнаружила группу аккаунтов с общими сигналами (IP/устройство/fingerprint).</p>
         <p>Пожалуйста, ответьте на это письмо и укажите, какой аккаунт нужно оставить основным. Остальные аккаунты будут обработаны только после вашего выбора.</p>`;

    const html = `
      <h2>Здравствуйте!</h2>
      ${messageHtml}
      <p>Пока идет проверка, автоматическое удаление аккаунтов не выполняется.</p>
    `;

    let sent = 0;
    const failed = [];
    for (const email of emails) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await emailService.sendGenericEventEmail(email, subject, html);
        sent += 1;
      } catch (error) {
        failed.push({
          email,
          error: normalizeText(error?.message || 'send_failed', 300),
        });
      }
    }

    if (riskCaseIds.length) {
      const nowIso = new Date().toISOString();
      for (const id of riskCaseIds) {
        // eslint-disable-next-line no-await-in-loop
        const row = await getModelDocById('RiskCase', id);
        if (!row) continue;
        const patch = {};
        if (['open', 'resolved'].includes(String(row.status))) {
          patch.status = isMultiAccountRiskCase(row) ? 'watch' : 'review';
        }
        const note = `[${nowIso}] admin_group_contact_sent:${subject}`;
        const prev = String(row.notes || '').trim();
        patch.notes = prev ? `${prev}\n${note}` : note;
        patch.meta = {
          ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
          lastGroupContactAt: new Date(),
          lastGroupContactBy: req.user?._id || null,
          lastGroupContactSubject: subject,
        };
        // eslint-disable-next-line no-await-in-loop
        await updateModelDoc('RiskCase', row._id, patch);
      }
    }

    await writeAuthEvent({
      user: null,
      email: '',
      eventType: 'multi_account_contacted',
      result: failed.length ? 'failed' : 'success',
      reason: 'admin_group_contact',
      req,
      meta: {
        operationId,
        sent,
        failed: failed.length,
        emails,
        riskCaseIds,
      },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.security.risk.contact_group',
      'RiskCase',
      riskCaseIds[0] || null,
      null,
      { sent, failed, emails, riskCaseIds },
      { operationId, subject },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: failed.length ? 'partial' : 'executed',
      auditId,
      message: failed.length
        ? `Письма отправлены частично: ${sent}/${emails.length}`
        : `Письма отправлены: ${sent}/${emails.length}`,
      data: {
        sent,
        total: emails.length,
        failed,
      },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listIpBlockRules(req, res) {
  try {
    const query = {};
    if (req.query.type) query.ruleType = String(req.query.type);
    if (req.query.status) {
      const status = String(req.query.status);
      if (status === 'active') query.isActive = true;
      if (status === 'off') query.isActive = false;
    }

    const all = await listModelDocs('IpBlockRule', { pageSize: 2000 });
    const safeRules = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.ruleType && String(row?.ruleType || '') !== String(query.ruleType)) return false;
        if (query.isActive !== undefined && Boolean(row?.isActive) !== Boolean(query.isActive)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 1000);

    const actorIds = Array.from(new Set(safeRules.map((row) => toId(row?.blockedBy)).filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enrichedRules = safeRules.map((row) => {
      const id = toId(row?.blockedBy);
      const u = id ? actorMap.get(id) : null;
      return {
        ...row,
        blockedBy: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.blockedBy,
      };
    });

    return res.json({ rules: enrichedRules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getIpRules(req, res) {
  return listIpBlockRules(req, res);
}

async function blockIpRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { ruleType, value, reason, isWhitelist = false, expiresAt = null } = req.body || {};
    const rule = await upsertIpRule({
      ruleType,
      value,
      reason,
      isWhitelist,
      actorId: req.user?._id || null,
      expiresAt,
    });

    const auditId = await logCmsAudit(
      req,
      isWhitelist ? 'cms.security.ip.whitelist' : 'cms.security.ip.block',
      'IpBlockRule',
      rule._id,
      null,
      rule,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: isWhitelist ? 'Исключение добавлено' : 'Правило блокировки добавлено',
      data: { rule },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function unblockIpRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { ruleType, value, isWhitelist = false } = req.body || {};
    const rule = await disableIpRule({ ruleType, value, isWhitelist });
    if (!rule) return res.status(404).json({ message: 'Правило не найдено' });

    const auditId = await logCmsAudit(
      req,
      isWhitelist ? 'cms.security.ip.whitelist.remove' : 'cms.security.ip.unblock',
      'IpBlockRule',
      rule._id,
      null,
      rule,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило отключено',
      data: { rule },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function getAuthEvents(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const supabase = getSupabaseClient();
    let q = supabase
      .from('auth_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(skip, skip + limit - 1);

    if (req.query.user) q = q.eq('user_id', String(req.query.user));
    if (req.query.eventType) q = q.eq('event_type', String(req.query.eventType));
    if (req.query.result) q = q.eq('result', String(req.query.result));
    if (req.query.ip) q = q.eq('ip', String(req.query.ip));
    if (req.query.deviceId) q = q.eq('device_id', String(req.query.deviceId));

    const from = req.query.from ? toDate(req.query.from) : null;
    const to = req.query.to ? toDate(req.query.to) : null;
    if (from) q = q.gte('created_at', from.toISOString());
    if (to) q = q.lte('created_at', to.toISOString());

    const { data, error, count } = await q;
    if (error) throw error;
    const eventsRaw = Array.isArray(data) ? data : [];

    const userIds = Array.from(new Set(eventsRaw.map((row) => String(row?.user_id || '').trim()).filter(Boolean)));
    const userMap = new Map();
    if (userIds.length) {
      const { data: users, error: userErr } = await supabase
        .from('users')
        .select('id,email,nickname,status')
        .in('id', userIds);
      if (!userErr && Array.isArray(users)) {
        users.forEach((u) => userMap.set(String(u.id), u));
      }
    }

    const events = eventsRaw.map((row) => {
      const u = row?.user_id ? userMap.get(String(row.user_id)) : null;
      return {
        _id: row?.id,
        user: row?.user_id
          ? {
            _id: row.user_id,
            email: u?.email,
            nickname: u?.nickname,
            status: u?.status,
          }
          : null,
        email: row?.email,
        eventType: row?.event_type,
        result: row?.result,
        reason: row?.reason,
        ip: row?.ip,
        userAgent: row?.user_agent,
        deviceId: row?.device_id,
        fingerprint: row?.fingerprint,
        sessionId: row?.session_id,
        meta: row?.meta,
        createdAt: row?.created_at,
        updatedAt: row?.updated_at,
      };
    });
    const total = Number(count || 0);

    return res.json({
      events,
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

async function getUserSessions(req, res) {
  try {
    const userId = req.params.id;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', String(userId))
      .order('started_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const sessionsRaw = Array.isArray(data) ? data : [];

    const revokedByIds = Array.from(new Set(sessionsRaw.map((row) => String(row?.revoked_by || '').trim()).filter(Boolean)));
    const revokedByMap = new Map();
    if (revokedByIds.length) {
      const { data: users, error: userErr } = await supabase
        .from('users')
        .select('id,email,nickname')
        .in('id', revokedByIds);
      if (!userErr && Array.isArray(users)) {
        users.forEach((u) => revokedByMap.set(String(u.id), u));
      }
    }

    const sessions = sessionsRaw.map((row) => {
      const revokedBy = row?.revoked_by ? revokedByMap.get(String(row.revoked_by)) : null;
      return {
        _id: row?.session_id,
        sessionId: row?.session_id,
        user: row?.user_id,
        ip: row?.ip,
        deviceId: row?.device_id,
        fingerprint: row?.fingerprint,
        userAgent: row?.user_agent,
        startedAt: row?.started_at,
        lastSeenAt: row?.last_seen_at,
        endedAt: row?.ended_at,
        isActive: row?.is_active,
        revokedAt: row?.revoked_at,
        revokedBy: row?.revoked_by
          ? {
            _id: row.revoked_by,
            email: revokedBy?.email,
            nickname: revokedBy?.nickname,
          }
          : null,
        revokeReason: row?.revoke_reason,
        createdAt: row?.created_at,
        updatedAt: row?.updated_at,
      };
    });

    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function revokeUserSession(req, res) {
  try {
    const operationId = buildOperationId();
    const { sessionId } = req.params;
    const reason = normalizeText(req.body?.reason || 'revoked_by_admin', 300);
    const session = await revokeSession({
      sessionId,
      revokedBy: req.user?._id || null,
      reason,
    });

    if (!session) return res.status(404).json({ message: 'Сессия не найдена' });

    await writeAuthEvent({
      user: session.user_id,
      eventType: 'session_revoked',
      result: 'success',
      reason,
      req,
      sessionId: session.session_id,
      meta: { revokedBy: req.user?._id || null },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.sessions.revoke',
      'UserSession',
      session.session_id,
      null,
      session,
      { operationId, reason },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Сессия завершена',
      data: { session },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function revokeAllSessions(req, res) {
  try {
    const operationId = buildOperationId();
    const userId = req.params.id;
    const reason = normalizeText(req.body?.reason || 'revoke_all_by_admin', 300);
    const revokedCount = await revokeAllUserSessions({
      userId,
      revokedBy: req.user?._id || null,
      reason,
    });

    await writeAuthEvent({
      user: userId,
      eventType: 'session_revoked',
      result: 'success',
      reason,
      req,
      sessionId: '',
      meta: { mode: 'all', revokedCount },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.sessions.revoke_all',
      'User',
      userId,
      null,
      { revokedCount },
      { operationId, reason },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Все сессии пользователя завершены',
      data: { revokedCount },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listModerationRules(req, res) {
  try {
    const query = {};
    if (req.query.isEnabled !== undefined) query.isEnabled = String(req.query.isEnabled) === 'true';
    if (req.query.type) query.type = String(req.query.type);

    const all = await listModelDocs('ModerationRule', { pageSize: 2000 });
    const rules = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.isEnabled !== undefined && Boolean(row?.isEnabled) !== Boolean(query.isEnabled)) return false;
        if (query.type && String(row?.type || '') !== String(query.type)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 1000);
    return res.json({ rules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createModerationRule(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = req.body || {};
    const rule = await insertModelDoc('ModerationRule', {
      name: normalizeText(payload.name, 200),
      description: normalizeText(payload.description, 500),
      type: payload.type,
      pattern: normalizeText(payload.pattern, 1000),
      action: payload.action || 'flag',
      scopes: Array.isArray(payload.scopes) && payload.scopes.length ? payload.scopes : ['all'],
      flagOnly: Boolean(payload.flagOnly),
      isEnabled: payload.isEnabled !== undefined ? Boolean(payload.isEnabled) : true,
      isException: Boolean(payload.isException),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    if (!rule) return res.status(500).json({ message: 'Не удалось создать правило' });
    invalidateModerationRulesCache();

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.rule.create',
      'ModerationRule',
      rule._id,
      null,
      rule,
      { operationId }
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило создано',
      data: { rule },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchModerationRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { id } = req.params;
    const rule = await getModelDocById('ModerationRule', id);
    if (!rule) return res.status(404).json({ message: 'Правило не найдено' });

    const before = { ...rule };
    const payload = req.body || {};

    const patch = {};
    if (payload.name !== undefined) patch.name = normalizeText(payload.name, 200);
    if (payload.description !== undefined) patch.description = normalizeText(payload.description, 500);
    if (payload.pattern !== undefined) patch.pattern = normalizeText(payload.pattern, 1000);
    if (payload.type !== undefined) patch.type = payload.type;
    if (payload.action !== undefined) patch.action = payload.action;
    if (payload.scopes !== undefined) {
      patch.scopes = Array.isArray(payload.scopes) && payload.scopes.length ? payload.scopes : ['all'];
    }
    if (payload.flagOnly !== undefined) patch.flagOnly = Boolean(payload.flagOnly);
    if (payload.isEnabled !== undefined) patch.isEnabled = Boolean(payload.isEnabled);
    if (payload.isException !== undefined) patch.isException = Boolean(payload.isException);
    patch.updatedBy = req.user?._id || null;

    const saved = await updateModelDoc('ModerationRule', id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить правило' });
    invalidateModerationRulesCache();

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.rule.update',
      'ModerationRule',
      id,
      before,
      saved,
      { operationId }
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило обновлено',
      data: { rule: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function deleteModerationRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { id } = req.params;
    const rule = await getModelDocById('ModerationRule', id);
    if (!rule) return res.status(404).json({ message: 'Правило не найдено' });

    const before = { ...rule };
    await deleteModelDocs('ModerationRule', [id]);
    invalidateModerationRulesCache();

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.rule.delete',
      'ModerationRule',
      id,
      before,
      null,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило удалено',
      data: { id },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listModerationHits(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.scope) query.scope = req.query.scope;
    if (req.query.ruleType) query.ruleType = req.query.ruleType;
    if (req.query.user) query.user = req.query.user;

    const all = await listModelDocs('ModerationHit', { pageSize: 2000 });
    const filtered = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.status && String(row?.status || '') !== String(query.status)) return false;
        if (query.scope && String(row?.scope || '') !== String(query.scope)) return false;
        if (query.ruleType && String(row?.ruleType || '') !== String(query.ruleType)) return false;
        if (query.user && String(toId(row?.user) || '') !== String(query.user)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

    const total = filtered.length;
    const safeHits = filtered.slice(skip, skip + limit);

    const ruleIds = Array.from(new Set(safeHits.map((h) => toId(h?.rule)).filter(Boolean)));
    const rulesById = new Map();
    if (ruleIds.length) {
      const ruleDocs = await Promise.all(ruleIds.map((rid) => getModelDocById('ModerationRule', rid)));
      ruleDocs.filter(Boolean).forEach((r) => {
        rulesById.set(String(r._id), {
          _id: r._id,
          name: r.name,
          type: r.type,
          action: r.action,
        });
      });
    }

    const userIds = Array.from(new Set(safeHits.flatMap((h) => [toId(h?.user), toId(h?.resolvedBy)]).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedHits = safeHits.map((h) => {
      const rule = (() => {
        const id = toId(h?.rule);
        return id ? rulesById.get(String(id)) || null : null;
      })();
      const user = (() => {
        const id = toId(h?.user);
        const u = id ? userMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : null;
      })();
      const resolvedBy = (() => {
        const id = toId(h?.resolvedBy);
        const u = id ? userMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : null;
      })();
      return { ...h, rule, user, resolvedBy };
    });

    return res.json({
      hits: enrichedHits,
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

async function resolveModerationHit(req, res) {
  try {
    const operationId = buildOperationId();
    const { id } = req.params;
    const { status = 'resolved', note = '' } = req.body || {};
    const hit = await getModelDocById('ModerationHit', id);
    if (!hit) return res.status(404).json({ message: 'Срабатывание не найдено' });

    const before = { ...hit };
    const patch = {
      status: status === 'false_positive' ? 'false_positive' : 'resolved',
      resolvedBy: req.user?._id || null,
      resolvedAt: new Date(),
      resolutionNote: normalizeText(note, 500),
    };
    const saved = await updateModelDoc('ModerationHit', id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить срабатывание' });

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.hit.resolve',
      'ModerationHit',
      id,
      before,
      saved,
      { operationId }
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Срабатывание обработано',
      data: { hit: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
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
    const baseQuery = {};
    if (status) baseQuery.status = status;
    if (dateFrom || dateTo) {
      baseQuery.createdAt = {};
      if (dateFrom) baseQuery.createdAt.$gte = dateFrom;
      if (dateTo) baseQuery.createdAt.$lte = dateTo;
    }

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
async function analyticsOverview(req, res) {
  try {
    const period = String(req.query.period || 'day');
    const current = getPeriodWindow(period, 0);
    const previous = getPeriodWindow(period, 1);

    const supabase = getSupabaseClient();
    const currentStartIso = current.start.toISOString();
    const currentEndIso = current.end.toISOString();
    const prevStartIso = previous.start.toISOString();
    const prevEndIso = previous.end.toISOString();

    const [
      usersCurrent,
      usersPrevious,
      activeCurrent,
      activePrevious,
      pagesCurrent,
      pagesPrevious,
      articlesCurrent,
      articlesPrevious,
      hitsCurrent,
      hitsPrevious,
      errorsCurrent,
      errorsPrevious,
      adsCurrent,
      adsPrevious,
      battlesCurrent,
      battlesPrevious,
      referralsCurrent,
      referralsPrevious,
    ] = await Promise.all([
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', currentStartIso)
          .lt('created_at', currentEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', prevStartIso)
          .lt('created_at', prevEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('last_online_at', currentStartIso)
          .lt('last_online_at', currentEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('users')
          .select('id', { head: true, count: 'exact' })
          .gte('last_online_at', prevStartIso)
          .lt('last_online_at', prevEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const pages = await listModelDocs('ContentPage', { pageSize: 2000 });
        return (Array.isArray(pages) ? pages : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= current.start.getTime() && ts < current.end.getTime();
        }).length;
      })(),
      (async () => {
        const pages = await listModelDocs('ContentPage', { pageSize: 2000 });
        return (Array.isArray(pages) ? pages : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= previous.start.getTime() && ts < previous.end.getTime();
        }).length;
      })(),
      (async () => {
        const articles = await listModelDocs('ContentArticle', { pageSize: 2000 });
        return (Array.isArray(articles) ? articles : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= current.start.getTime() && ts < current.end.getTime();
        }).length;
      })(),
      (async () => {
        const articles = await listModelDocs('ContentArticle', { pageSize: 2000 });
        return (Array.isArray(articles) ? articles : []).filter((row) => {
          if (String(row?.status || '') !== 'published') return false;
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= previous.start.getTime() && ts < previous.end.getTime();
        }).length;
      })(),
      (async () => {
        const hits = await listModelDocs('ModerationHit', { pageSize: 2000 });
        return (Array.isArray(hits) ? hits : []).filter((row) => {
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= current.start.getTime() && ts < current.end.getTime();
        }).length;
      })(),
      (async () => {
        const hits = await listModelDocs('ModerationHit', { pageSize: 2000 });
        return (Array.isArray(hits) ? hits : []).filter((row) => {
          const ts = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
          return Number.isFinite(ts) && ts >= previous.start.getTime() && ts < previous.end.getTime();
        }).length;
      })(),
      (async () => {
        const supabase = getSupabaseClient();
        const { count, error } = await supabase
          .from(DOC_TABLE)
          .select('id', { head: true, count: 'exact' })
          .eq('model', 'SystemErrorEvent')
          .gte('created_at', current.start.toISOString())
          .lt('created_at', current.end.toISOString());
        return error ? 0 : Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const supabase = getSupabaseClient();
        const { count, error } = await supabase
          .from(DOC_TABLE)
          .select('id', { head: true, count: 'exact' })
          .eq('model', 'SystemErrorEvent')
          .gte('created_at', previous.start.toISOString())
          .lt('created_at', previous.end.toISOString());
        return error ? 0 : Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from(DOC_TABLE)
          .select('id,data,created_at')
          .eq('model', 'AdImpression')
          .gte('created_at', current.start.toISOString())
          .lt('created_at', current.end.toISOString())
          .limit(10000);
        if (error) return 0;
        return (data || []).filter((row) => row.data?.eventType === 'impression').length;
      })(),
      (async () => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from(DOC_TABLE)
          .select('id,data,created_at')
          .eq('model', 'AdImpression')
          .gte('created_at', previous.start.toISOString())
          .lt('created_at', previous.end.toISOString())
          .limit(10000);
        if (error) return 0;
        return (data || []).filter((row) => row.data?.eventType === 'impression').length;
      })(),
      (async () => {
        const supabase = getSupabaseClient();
        const { count, error } = await supabase
          .from(DOC_TABLE)
          .select('id', { head: true, count: 'exact' })
          .eq('model', 'Battle')
          .gte('created_at', current.start.toISOString())
          .lt('created_at', current.end.toISOString());
        return error ? 0 : Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const supabase = getSupabaseClient();
        const { count, error } = await supabase
          .from(DOC_TABLE)
          .select('id', { head: true, count: 'exact' })
          .eq('model', 'Battle')
          .gte('created_at', previous.start.toISOString())
          .lt('created_at', previous.end.toISOString());
        return error ? 0 : Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('referrals')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', currentStartIso)
          .lt('created_at', currentEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
      (async () => {
        const { count, error } = await supabase
          .from('referrals')
          .select('id', { head: true, count: 'exact' })
          .gte('created_at', prevStartIso)
          .lt('created_at', prevEndIso);
        if (error) return 0;
        return Math.max(0, Number(count) || 0);
      })(),
    ]);

    const metrics = {
      usersNew: { current: usersCurrent, previous: usersPrevious },
      usersActive: { current: activeCurrent, previous: activePrevious },
      pagesPublished: { current: pagesCurrent, previous: pagesPrevious },
      articlesPublished: { current: articlesCurrent, previous: articlesPrevious },
      moderationHits: { current: hitsCurrent, previous: hitsPrevious },
      errors: { current: errorsCurrent, previous: errorsPrevious },
      adImpressions: { current: adsCurrent, previous: adsPrevious },
      battles: { current: battlesCurrent, previous: battlesPrevious },
      referrals: { current: referralsCurrent, previous: referralsPrevious },
    };

    const withDelta = Object.fromEntries(
      Object.entries(metrics).map(([key, value]) => {
        const delta = value.current - value.previous;
        return [key, { ...value, delta }];
      })
    );

    return res.json({
      period: current.period,
      current: { from: current.start, to: current.end },
      previous: { from: previous.start, to: previous.end },
      metrics: withDelta,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function analyticsTopPages(req, res) {
  try {
    const period = String(req.query.period || 'day');
    const range = getPeriodWindow(period, 0);

    const logs = await listActivities({
      userIds: ['*'],
      types: ['page_view'],
      since: range.start,
      until: range.end,
      limit: 10000,
    });

    const byPath = new Map();
    for (const row of logs) {
      const path = String(row?.meta?.path || '').trim();
      if (!path) continue;
      if (!byPath.has(path)) {
        byPath.set(path, { path, views: 0, users: new Set(), totalMinutes: 0 });
      }
      const item = byPath.get(path);
      item.views += 1;
      if (row.user_id) item.users.add(String(row.user_id));
      const minutes = Number(row.minutes) || 0;
      item.totalMinutes += minutes;
    }

    const rows = Array.from(byPath.values())
      .map((item) => ({
        path: item.path,
        views: item.views,
        uniqueUsers: item.users.size,
        totalMinutes: Math.round(item.totalMinutes * 100) / 100,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 200);

    return res.json({
      period: range.period,
      from: range.start,
      to: range.end,
      rows,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function analyticsTrafficSources(req, res) {
  try {
    const period = String(req.query.period || 'day');
    const range = getPeriodWindow(period, 0);

    const logs = await listActivities({
      userIds: ['*'],
      types: ['page_view'],
      since: range.start,
      until: range.end,
      limit: 10000,
    });

    const byReferrer = new Map();
    const byUtm = new Map();

    for (const row of logs) {
      const ref = String(row?.meta?.referrer || '').trim() || '(direct)';
      byReferrer.set(ref, (byReferrer.get(ref) || 0) + 1);

      const source = String(row?.meta?.utm_source || '').trim();
      const medium = String(row?.meta?.utm_medium || '').trim();
      const campaign = String(row?.meta?.utm_campaign || '').trim();
      const key = [source || '(none)', medium || '(none)', campaign || '(none)'].join('|');
      byUtm.set(key, (byUtm.get(key) || 0) + 1);
    }

    const referrerRows = Array.from(byReferrer.entries())
      .map(([referrer, views]) => ({ referrer, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 200);

    const utmRows = Array.from(byUtm.entries())
      .map(([key, views]) => {
        const [utm_source, utm_medium, utm_campaign] = key.split('|');
        return { utm_source, utm_medium, utm_campaign, views };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 200);

    return res.json({
      period: range.period,
      from: range.start,
      to: range.end,
      referrers: referrerRows,
      utm: utmRows,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function analyticsExport(req, res) {
  try {
    const table = String(req.query.table || req.query.report || 'users').trim();
    const fileName = `cms_export_${table}_${Date.now()}.csv`;

    let headers = [];
    let rows = [];
    let mapRow = null;

    if (table === 'users') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,status,created_at')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      headers = [
        { key: 'id', label: 'ID' },
        { key: 'email', label: 'Email' },
        { key: 'nickname', label: 'Nickname' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'CreatedAt' },
      ];
      mapRow = (u) => ({
        id: u.id,
        email: u.email,
        nickname: u.nickname,
        status: u.status,
        createdAt: u.created_at,
      });
    } else if (table === 'auth-events') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('auth_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10000);
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      headers = [
        { key: 'createdAt', label: 'CreatedAt' },
        { key: 'eventType', label: 'EventType' },
        { key: 'result', label: 'Result' },
        { key: 'email', label: 'Email' },
        { key: 'ip', label: 'IP' },
        { key: 'reason', label: 'Reason' },
      ];
      mapRow = (e) => ({
        createdAt: e.created_at,
        eventType: e.event_type,
        result: e.result,
        email: e.email,
        ip: e.ip,
        reason: e.reason,
      });
    } else if (table === 'risk-cases') {
      const allCases = await listModelDocs('RiskCase', { pageSize: 5000 });
      rows = (Array.isArray(allCases) ? allCases : [])
        .sort((a, b) => (Number(b?.riskScore) || 0) - (Number(a?.riskScore) || 0))
        .slice(0, 5000);
      const ids = Array.from(new Set((Array.isArray(rows) ? rows : []).map((c) => toId(c?.user)).filter(Boolean)));
      const userMap = await getUsersByIds(ids);
      headers = [
        { key: 'user', label: 'User' },
        { key: 'riskScore', label: 'RiskScore' },
        { key: 'riskLevel', label: 'RiskLevel' },
        { key: 'status', label: 'Status' },
        { key: 'signals', label: 'Signals' },
      ];
      mapRow = (c) => ({
        user: (() => {
          const id = toId(c?.user);
          const u = id ? userMap.get(id) : null;
          return u?.email || u?.nickname || id || c.user;
        })(),
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        status: c.status,
        signals: Array.isArray(c.signals) ? c.signals.join('; ') : '',
      });
    } else if (table === 'errors') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at')
        .eq('model', 'SystemErrorEvent')
        .order('created_at', { ascending: false })
        .limit(10000);
      rows = (data || []).map((row) => ({ _id: row.id, ...row.data, createdAt: row.created_at }));
      headers = [
        { key: 'createdAt', label: 'CreatedAt' },
        { key: 'eventType', label: 'EventType' },
        { key: 'statusCode', label: 'StatusCode' },
        { key: 'method', label: 'Method' },
        { key: 'path', label: 'Path' },
        { key: 'message', label: 'Message' },
      ];
      mapRow = (e) => ({
        createdAt: e.createdAt,
        eventType: e.eventType,
        statusCode: e.statusCode,
        method: e.method,
        path: e.path,
        message: e.message,
      });
    } else if (table === 'content-pages') {
      const allPages = await listModelDocs('ContentPage', { pageSize: 5000 });
      rows = (Array.isArray(allPages) ? allPages : [])
        .sort((a, b) => {
          const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 5000);
      headers = [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'slug', label: 'Slug' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'UpdatedAt' },
      ];
      mapRow = (p) => ({
        id: p._id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updatedAt,
      });
    } else if (table === 'content-articles') {
      const allArticles = await listModelDocs('ContentArticle', { pageSize: 5000 });
      rows = (Array.isArray(allArticles) ? allArticles : [])
        .sort((a, b) => {
          const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 5000);
      headers = [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'slug', label: 'Slug' },
        { key: 'status', label: 'Status' },
        { key: 'updatedAt', label: 'UpdatedAt' },
      ];
      mapRow = (p) => ({
        id: p._id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updatedAt,
      });
    } else {
      return res.status(400).json({ message: 'Неподдерживаемый тип экспорта' });
    }

    await sendCsvResponse(res, { headers, rows, mapRow, fileName });
    return null;
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getBackups(req, res) {
  try {
    const backups = listBackups({ limit: toNumber(req.query.limit, 100) });
    return res.json({ backups });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createBackup(req, res) {
  try {
    const { reason, impactPreview, confirmationPhrase } = req.body || {};
    const approval = await createOperationApproval({
      req,
      actionType: 'system.backup.create',
      reason,
      impactPreview,
      confirmationPhrase,
      payload: {
        source: 'cms_backups_create',
      },
    });

    return res.status(202).json(mutationResponse({
      operationId: approval.operationId,
      status: approval.approval.status,
      requiresApproval: true,
      auditId: approval.auditId,
      message: 'Операция отправлена на подтверждение',
      data: { approval: serializeApproval(approval.approval) },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function restoreBackup(req, res) {
  try {
    const { backupId, backupPath, reason, impactPreview, confirmationPhrase } = req.body || {};

    const approval = await createOperationApproval({
      req,
      actionType: 'system.job.run',
      reason: reason || 'Restore backup via CMS',
      impactPreview: impactPreview || 'Восстановление данных из резервной копии',
      confirmationPhrase,
      payload: {
        jobName: 'backup_restore',
        params: {
          backupId: backupId || null,
          backupPath: backupPath || null,
        },
      },
    });

    return res.status(202).json(mutationResponse({
      operationId: approval.operationId,
      status: approval.approval.status,
      requiresApproval: true,
      auditId: approval.auditId,
      message: 'Восстановление отправлено на подтверждение',
      data: { approval: serializeApproval(approval.approval) },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function clearCache(req, res) {
  try {
    const operationId = buildOperationId();
    const zone = String(req.body?.zone || 'system').trim().toLowerCase();

    const result = clearCacheByZone(zone);

    const auditId = await logCmsAudit(
      req,
      'cms.system.cache.clear',
      'cache',
      null,
      null,
      result,
      { operationId, zone },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Кэш очищен',
      data: result,
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listSystemErrors(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at', { count: 'exact' })
      .eq('model', 'SystemErrorEvent')
      .order('created_at', { ascending: false });
    
    if (req.query.statusCode) {
      query = query.eq('data->>statusCode', String(Number(req.query.statusCode)));
    }
    if (req.query.eventType) {
      query = query.eq('data->>eventType', String(req.query.eventType));
    }
    if (req.query.path) {
      query = query.ilike('data->>path', `%${String(req.query.path)}%`);
    }
    
    const { data, error, count } = await query.range(skip, skip + limit - 1);
    
    if (error) return res.status(500).json({ message: error.message });
    
    const events = (data || []).map((row) => ({ _id: row.id, ...row.data, createdAt: row.created_at }));
    const total = count || 0;

    const safeEvents = Array.isArray(events) ? events : [];
    const userIds = Array.from(new Set(safeEvents.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedEvents = safeEvents.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return {
        ...row,
        user: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.user,
      };
    });

    const topRoutesMap = new Map();
    for (const item of events) {
      const key = `${item.method || ''} ${item.path || ''}`.trim() || '(unknown)';
      topRoutesMap.set(key, (topRoutesMap.get(key) || 0) + 1);
    }
    const topRoutes = Array.from(topRoutesMap.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return res.json({
      events: enrichedEvents,
      topRoutes,
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

function matchesCampaignSegment(user, riskLevel, segment) {
  const safeSegment = segment && typeof segment === 'object' ? segment : {};

  if (safeSegment.status) {
    const statuses = Array.isArray(safeSegment.status) ? safeSegment.status : [safeSegment.status];
    if (!statuses.includes(user?.status)) return false;
  }

  if (safeSegment.language) {
    const langs = Array.isArray(safeSegment.language) ? safeSegment.language : [safeSegment.language];
    if (!langs.includes(user?.language)) return false;
  }

  if (safeSegment.registeredFrom) {
    const from = toDate(safeSegment.registeredFrom);
    if (from && new Date(user?.createdAt || 0).getTime() < from.getTime()) return false;
  }

  if (safeSegment.registeredTo) {
    const to = toDate(safeSegment.registeredTo);
    if (to && new Date(user?.createdAt || 0).getTime() > to.getTime()) return false;
  }

  if (safeSegment.activeDays !== undefined) {
    const days = Math.max(0, Number(safeSegment.activeDays) || 0);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (!(user?.lastOnlineAt && new Date(user.lastOnlineAt).getTime() >= from.getTime())) return false;
  }

  if (safeSegment.riskLevels) {
    const allowed = new Set(Array.isArray(safeSegment.riskLevels) ? safeSegment.riskLevels : [safeSegment.riskLevels]);
    if (!allowed.has(riskLevel || 'low')) return false;
  }

  return true;
}

function applyCampaignSegment(users, riskLevelsByUser, segment) {
  const caseMap = riskLevelsByUser instanceof Map
    ? riskLevelsByUser
    : new Map((Array.isArray(riskLevelsByUser) ? riskLevelsByUser : []).map((r) => [String(r.user), r.riskLevel]));
  return (Array.isArray(users) ? users : []).filter((user) => {
    const userId = String(user?._id || '');
    return matchesCampaignSegment(user, caseMap.get(userId) || 'low', segment);
  });
}

async function listMailCampaigns(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 20 });
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at', { count: 'exact' })
      .eq('model', 'MailCampaign')
      .order('created_at', { ascending: false });
    
    if (req.query.status) {
      query = query.eq('data->>status', String(req.query.status));
    }
    
    const { data, error, count } = await query.range(skip, skip + limit - 1);
    
    if (error) return res.status(500).json({ message: error.message });
    
    const campaigns = (data || []).map((row) => ({ _id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
    const total = count || 0;

    const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
    const actorIds = Array.from(new Set(safeCampaigns
      .flatMap((row) => [toId(row?.createdBy), toId(row?.updatedBy)])
      .filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enrichedCampaigns = safeCampaigns.map((row) => {
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
      return { ...row, createdBy: created, updatedBy: updated };
    });

    return res.json({
      campaigns: enrichedCampaigns,
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

async function createMailCampaign(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = req.body || {};
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const id = `mc_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    
    const campaignData = {
      name: normalizeText(payload.name, 200),
      subject: normalizeText(payload.subject, 300),
      html: normalizeText(payload.html, 100000),
      text: normalizeText(payload.text, 100000),
      status: ['draft', 'scheduled'].includes(payload.status) ? payload.status : 'draft',
      segment: payload.segment && typeof payload.segment === 'object' ? payload.segment : {},
      scheduledAt: payload.scheduledAt ? toDate(payload.scheduledAt) : null,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    };
    
    await supabase.from(DOC_TABLE).insert({
      model: 'MailCampaign',
      id,
      data: campaignData,
      created_at: nowIso,
      updated_at: nowIso,
    });
    
    const campaign = { _id: id, ...campaignData, createdAt: nowIso, updatedAt: nowIso };

    const auditId = await logCmsAudit(
      req,
      'cms.mail.campaign.create',
      'MailCampaign',
      campaign._id,
      null,
      campaign,
      { operationId },
      'high'
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Кампания создана',
      data: { campaign },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function runMailCampaign(req, res) {
  try {
    const operationId = buildOperationId();
    const supabase = getSupabaseClient();
    
    const { data: campaignRow, error: findError } = await supabase
      .from(DOC_TABLE)
      .select('id,data')
      .eq('model', 'MailCampaign')
      .eq('id', req.params.id)
      .maybeSingle();
    
    if (!campaignRow) return res.status(404).json({ message: 'Кампания не найдена' });
    
    const campaign = { _id: campaignRow.id, ...campaignRow.data };

    const limit = Math.max(1, Math.min(10000, Number(req.body?.limit || req.query?.limit || 2000)));

    // Update campaign status
    await supabase
      .from(DOC_TABLE)
      .update({
        data: {
          ...campaignRow.data,
          status: 'running',
          updatedBy: req.user?._id || null,
          lastRunAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignRow.id);

    const riskLevelsByUser = new Map();
    const riskRows = await listModelDocs('RiskCase', { pageSize: 5000 });
    (Array.isArray(riskRows) ? riskRows : []).forEach((row) => {
      const userId = toId(row?.user);
      if (!userId) return;
      const prev = riskLevelsByUser.get(String(userId));
      const prevScore = Number(prev?.riskScore || 0);
      const nextScore = Number(row?.riskScore || 0);
      if (!prev || nextScore >= prevScore) {
        riskLevelsByUser.set(String(userId), {
          riskLevel: row?.riskLevel || 'low',
          riskScore: nextScore,
        });
      }
    });

    const selected = [];
    const pageSize = 1000;
    let from = 0;
    while (selected.length < limit) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,status,language,created_at,last_online_at,email_confirmed')
        .eq('email_confirmed', true)
        .neq('status', 'banned')
        .range(from, from + pageSize - 1);
      if (error || !Array.isArray(data) || !data.length) break;

      for (const row of data) {
        const user = {
          _id: row?.id,
          email: row?.email,
          nickname: row?.nickname,
          status: row?.status,
          language: row?.language,
          createdAt: row?.created_at ? new Date(row.created_at) : null,
          lastOnlineAt: row?.last_online_at ? new Date(row.last_online_at) : null,
        };
        const email = String(user.email || '').trim();
        if (!email) continue;
        const riskLevel = riskLevelsByUser.get(String(user._id || ''))?.riskLevel || 'low';
        if (!matchesCampaignSegment(user, riskLevel, campaign.segment)) continue;
        selected.push(user);
        if (selected.length >= limit) break;
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    let sent = 0;
    let failed = 0;

    for (const user of selected) {
      const email = String(user.email || '').trim().toLowerCase();
      if (!email) continue;
      const dedupeKey = `${campaign._id}:${email}`;

      // eslint-disable-next-line no-await-in-loop
      const { data: existingDelivery } = await supabase
        .from(DOC_TABLE)
        .select('id')
        .eq('model', 'MailDelivery')
        .eq('data->>dedupeKey', dedupeKey)
        .maybeSingle();
      if (existingDelivery) continue;

      // eslint-disable-next-line no-await-in-loop
      const deliveryId = `md_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const deliveryData = {
        campaign: campaign._id,
        user: user._id,
        email,
        status: 'pending',
        dedupeKey,
      };
      
      await supabase.from(DOC_TABLE).insert({
        model: 'MailDelivery',
        id: deliveryId,
        data: deliveryData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      try {
        // eslint-disable-next-line no-await-in-loop
        await emailService.sendGenericEventEmail(email, campaign.subject, campaign.html);
        
        await supabase
          .from(DOC_TABLE)
          .update({
            data: { ...deliveryData, status: 'sent', sentAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliveryId);
        sent += 1;
      } catch (error) {
        await supabase
          .from(DOC_TABLE)
          .update({
            data: { ...deliveryData, status: 'failed', error: normalizeText(error?.message || 'Email send failed', 500) },
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliveryId);
        failed += 1;
      }
    }

    // Update final status
    const finalStatus = failed > 0 && sent === 0 ? 'failed' : 'completed';
    
    await supabase
      .from(DOC_TABLE)
      .update({
        data: {
          ...campaignRow.data,
          status: finalStatus,
          stats: {
            total: selected.length,
            sent,
            failed,
          },
          updatedBy: req.user?._id || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignRow.id);

    const auditId = await logCmsAudit(
      req,
      'cms.mail.campaign.run',
      'MailCampaign',
      campaign._id,
      null,
      campaign,
      { operationId, selected: selected.length, sent, failed },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: campaign.status,
      auditId,
      message: 'Рассылка выполнена',
      data: {
        campaign,
        summary: {
          selected: selected.length,
          sent,
          failed,
        },
      },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function campaignDeliveries(req, res) {
  try {
    const campaignId = req.params.id;
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at', { count: 'exact' })
      .eq('model', 'MailDelivery')
      .eq('data->>campaign', campaignId)
      .order('created_at', { ascending: false });
    
    if (req.query.status) {
      query = query.eq('data->>status', String(req.query.status));
    }
    
    const { data, error, count } = await query.range(skip, skip + limit - 1);
    
    if (error) return res.status(500).json({ message: error.message });
    
    const deliveries = (data || []).map((row) => ({ _id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
    const total = count || 0;

    const safeDeliveries = Array.isArray(deliveries) ? deliveries : [];
    const userIds = Array.from(new Set(safeDeliveries.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedDeliveries = safeDeliveries.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return { ...row, user: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.user };
    });

    return res.json({
      deliveries: enrichedDeliveries,
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

async function getFortuneConfigCms(req, res) {
  try {
    const config = await getFortuneConfig();
    return res.json({ config });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function patchFortuneRoulette(req, res) {
  try {
    const operationId = buildOperationId();
    const before = await getFortuneConfig();
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const next = await patchRouletteConfig(patch, req.user?._id || null);

    const auditId = await logCmsAudit(
      req,
      'cms.fortune.roulette.update',
      'Settings',
      'FORTUNE_CONFIG_V1',
      before,
      next,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Конфигурация рулетки обновлена',
      data: { config: next },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchFortuneLottery(req, res) {
  try {
    const operationId = buildOperationId();
    const before = await getFortuneConfig();
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const next = await patchLotteryConfig(patch, req.user?._id || null);

    const auditId = await logCmsAudit(
      req,
      'cms.fortune.lottery.update',
      'Settings',
      'FORTUNE_CONFIG_V1',
      before,
      next,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Конфигурация лотереи обновлена',
      data: { config: next },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function fortuneStatsCms(req, res) {
  return fortuneController.getGlobalStats(req, res);
}

async function listFortuneWins(req, res) {
  try {
    await cleanupOldFortuneWins(90);

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const now = new Date();
    const from = toDate(req.query.from) || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = toDate(req.query.to) || now;
    const supabase = getSupabaseClient();

    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at', { count: 'exact' })
      .eq('model', 'FortuneWinLog')
      .gte('data->>occurredAt', from.toISOString())
      .lte('data->>occurredAt', to.toISOString())
      .order('data->>occurredAt', { ascending: false });

    if (req.query.gameType && ['roulette', 'lottery'].includes(String(req.query.gameType))) {
      query = query.eq('data->>gameType', String(req.query.gameType));
    }
    if (req.query.userId) {
      query = query.eq('data->>user', String(req.query.userId));
    }
    if (req.query.rewardType && ['k', 'star', 'spin', 'other'].includes(String(req.query.rewardType))) {
      query = query.eq('data->>rewardType', String(req.query.rewardType));
    }

    const { data, error, count } = await query.range(skip, skip + limit - 1);
    
    if (error) return res.status(500).json({ message: error.message });
    
    const rows = (data || []).map((row) => ({ _id: row.id, ...row.data, createdAt: row.created_at }));
    const total = count || 0;

    // Calculate summary
    const allRows = await supabase
      .from(DOC_TABLE)
      .select('data')
      .eq('model', 'FortuneWinLog')
      .gte('data->>occurredAt', from.toISOString())
      .lte('data->>occurredAt', to.toISOString())
      .limit(10000);
    
    const summaryMap = { roulette: { count: 0, totalAmount: 0 }, lottery: { count: 0, totalAmount: 0 } };
    for (const row of (allRows.data || [])) {
      const d = row.data || {};
      const gameType = d.gameType || 'unknown';
      if (summaryMap[gameType]) {
        summaryMap[gameType].count += 1;
        summaryMap[gameType].totalAmount += Number(d.amount) || 0;
      }
    }

    const safeRows = Array.isArray(rows) ? rows : [];
    const userIds = Array.from(new Set(safeRows.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedRows = safeRows.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return { ...row, user: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.user };
    });

    return res.json({
      rows: enrichedRows,
      summary: {
        all: {
          count: summaryMap.roulette.count + summaryMap.lottery.count,
          totalAmount: summaryMap.roulette.totalAmount + summaryMap.lottery.totalAmount,
        },
        roulette: { ...summaryMap.roulette, avgAmount: summaryMap.roulette.count > 0 ? Math.round((summaryMap.roulette.totalAmount / summaryMap.roulette.count) * 100) / 100 : 0 },
        lottery: { ...summaryMap.lottery, avgAmount: summaryMap.lottery.count > 0 ? Math.round((summaryMap.lottery.totalAmount / summaryMap.lottery.count) * 100) / 100 : 0 },
      },
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

async function exportFortuneWins(req, res) {
  try {
    await cleanupOldFortuneWins(90);

    const now = new Date();
    const from = toDate(req.query.from) || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = toDate(req.query.to) || now;
    const supabase = getSupabaseClient();

    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at')
      .eq('model', 'FortuneWinLog')
      .gte('data->>occurredAt', from.toISOString())
      .lte('data->>occurredAt', to.toISOString())
      .limit(20000);

    if (req.query.gameType && ['roulette', 'lottery'].includes(String(req.query.gameType))) {
      query = query.eq('data->>gameType', String(req.query.gameType));
    }
    if (req.query.userId) {
      query = query.eq('data->>user', String(req.query.userId));
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: error.message });

    const rows = (data || []).map((row) => ({ _id: row.id, ...row.data, createdAt: row.created_at }));

    const safeRows = Array.isArray(rows) ? rows : [];
    const userIds = Array.from(new Set(safeRows.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);

    const headers = [
      { key: 'occurredAt', label: 'OccurredAt' },
      { key: 'gameType', label: 'GameType' },
      { key: 'rewardType', label: 'RewardType' },
      { key: 'amount', label: 'Amount' },
      { key: 'label', label: 'Label' },
      { key: 'userId', label: 'UserId' },
      { key: 'nickname', label: 'Nickname' },
      { key: 'email', label: 'Email' },
      { key: 'drawDate', label: 'DrawDate' },
    ];

    const csvRows = safeRows.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return {
      occurredAt: row.occurredAt,
      gameType: row.gameType,
      rewardType: row.rewardType,
      amount: row.amount,
      label: row.label,
      userId: u?.id || id || '',
      nickname: u?.nickname || '',
      email: u?.email || '',
      drawDate: row.drawDate || '',
      };
    });

    const csv = toCsv(headers, csvRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fortune-wins-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function drawLotteryNowCms(req, res) {
  try {
    const confirmationPhrase = String(req.body?.confirmationPhrase || '').trim();
    if (confirmationPhrase !== 'CONFIRM fortune.lottery.draw_now') {
      return res.status(400).json({ message: 'Неверная фраза подтверждения' });
    }

    const operationId = buildOperationId();
    await fortuneController.drawLottery();

    const auditId = await logCmsAudit(
      req,
      'cms.fortune.lottery.draw_now',
      'Lottery',
      null,
      null,
      { triggeredAt: new Date() },
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Розыгрыш лотереи запущен',
      data: { triggered: true },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  listRiskCases,
  getRiskCase,
  applyRiskCasePenalty,
  resolveRiskCase,
  unfreezeRiskCaseGroup,
  watchRiskCaseGroup,
  banRiskCaseGroup,
  deleteRiskCase,
  recomputeRisk,
  sendRiskCaseContactEmail,
  sendRiskGroupContactEmail,
  getIpRules,
  blockIpRule,
  unblockIpRule,
  getAuthEvents,
  getUserSessions,
  revokeUserSession,
  revokeAllSessions,
  listModerationRules,
  createModerationRule,
  patchModerationRule,
  deleteModerationRule,
  listModerationHits,
  resolveModerationHit,
  listPages,
  createPage,
  patchPage,
  publishPage,
  pageVersions,
  rollbackPage,
  listArticles,
  createArticle,
  patchArticle,
  publishArticle,
  articleVersions,
  rollbackArticle,
  contentSearch,
  analyticsOverview,
  analyticsTopPages,
  analyticsTrafficSources,
  analyticsExport,
  getFortuneConfigCms,
  patchFortuneRoulette,
  patchFortuneLottery,
  fortuneStatsCms,
  listFortuneWins,
  exportFortuneWins,
  drawLotteryNowCms,
  getBackups,
  createBackup,
  restoreBackup,
  clearCache,
  listSystemErrors,
  listMailCampaigns,
  createMailCampaign,
  runMailCampaign,
  campaignDeliveries,
  listEmailTemplates,
  createEmailTemplate,
  importEmailTemplateDefaults,
  patchEmailTemplate,
  publishEmailTemplate,
  emailTemplateVersions,
  rollbackEmailTemplate,
  removeRelatedUserFromRiskCase,
};
