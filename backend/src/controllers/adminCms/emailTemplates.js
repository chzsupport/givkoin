const { createContentVersion, listContentVersions } = require('../../services/contentVersionService');
const { normalizeLocalizedTextInput } = require('../../utils/localizedContent');
const {
  buildOperationId,
  getModelDocById,
  getUsersByIds,
  insertModelDoc,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  toId,
  toNumber,
  updateModelDoc,
} = require('./shared');

function sanitizeEmailTemplatePayload(payload = {}) {
  return {
    key: normalizeText(payload.key, 120),
    name: normalizeText(payload.name || payload.key, 200),
    status: ['draft', 'published', 'archived'].includes(payload.status) ? payload.status : 'draft',
    subject: normalizeLocalizedTextInput(payload.subject, ''),
    html: normalizeLocalizedTextInput(payload.html, ''),
    text: normalizeLocalizedTextInput(payload.text, ''),
    note: normalizeText(payload.note, 1000),
  };
}

async function createEmailTemplateVersion(doc, changedBy, changeNote) {
  if (!doc) return null;
  return createContentVersion({
    entityType: 'email_template',
    entityId: doc._id,
    snapshot: doc.toObject ? doc.toObject() : doc,
    changedBy,
    changeNote,
  });
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

module.exports = {
  createEmailTemplate,
  emailTemplateVersions,
  importEmailTemplateDefaults,
  listEmailTemplates,
  patchEmailTemplate,
  publishEmailTemplate,
  rollbackEmailTemplate,
};
