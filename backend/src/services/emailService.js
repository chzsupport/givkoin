const axios = require('axios');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { getSupabaseClient } = require('../lib/supabaseClient');

const hasResendApi = Boolean(process.env.RESEND_API_KEY);
const isSmtpConfigured = Boolean(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);
const EMAIL_SEND_TIMEOUT_MS = Number(process.env.EMAIL_SEND_TIMEOUT_MS) || 12000;
const RESEND_API_URL = String(process.env.RESEND_API_URL || 'https://api.resend.com/emails').trim();
const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

let transporter = null;

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function getTemplateLangValue(value, lang) {
  const safe = value && typeof value === 'object' ? value : { ru: '', en: '' };
  const ru = typeof safe.ru === 'string' ? safe.ru : '';
  const en = typeof safe.en === 'string' ? safe.en : '';
  return pickLang(lang, ru, en);
}

function applyTemplateVars(template, vars) {
  const source = String(template || '');
  const map = vars && typeof vars === 'object' ? vars : {};
  return source.replace(/\{\{\s*([a-zA-Z0-9_\.\-]+)\s*\}\}/g, (_match, key) => {
    const value = map[key];
    if (value === null || value === undefined) return '';
    return String(value);
  });
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

async function listEmailTemplateDocs({ pageSize = 2000 } = {}) {
  const supabase = getSupabaseClient();
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 2000));
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'EmailTemplate')
    .range(0, size - 1);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapDocRow).filter(Boolean);
}

async function getEmailTemplateByKey(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  const list = await listEmailTemplateDocs({ pageSize: 2000 });
  const found = list.find((row) => String(row?.key || '') === safeKey) || null;
  return found;
}

async function sendTemplateEmail({
  templateKey,
  to,
  lang,
  vars,
  fallbackSubject,
  fallbackHtml,
  fallbackText,
}) {
  const from = process.env.FROM_EMAIL || process.env.EMAIL_USER;
  const fromName = process.env.FROM_NAME || 'GIVKOIN';

  let subject = String(fallbackSubject || '');
  let html = fallbackHtml ? String(fallbackHtml) : '';
  let text = fallbackText ? String(fallbackText) : '';

  try {
    const tpl = await getEmailTemplateByKey(templateKey);
    if (tpl && (tpl.status === 'published' || tpl.status === 'draft')) {
      const tplSubject = getTemplateLangValue(tpl.subject, lang);
      const tplHtml = getTemplateLangValue(tpl.html, lang);
      const tplText = getTemplateLangValue(tpl.text, lang);

      if (tplSubject.trim()) subject = tplSubject;
      if (tplHtml.trim()) html = tplHtml;
      if (tplText.trim()) text = tplText;

      subject = applyTemplateVars(subject, vars);
      html = applyTemplateVars(html, vars);
      text = applyTemplateVars(text, vars);
    }
  } catch (error) {
    logger.warn('[EMAIL] template load failed, fallback to code', {
      templateKey,
      error: error?.message || String(error),
    });
  }

  const mailOptions = {
    from: `${fromName} <${from}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  };

  await sendMailSafe(mailOptions);
}

if (hasResendApi) {
  logger.info('[EMAIL] Resend API configured', {
    apiUrl: RESEND_API_URL,
  });
}

if (isSmtpConfigured) {
  const smtpPort = Number(process.env.EMAIL_PORT) || 587;
  const smtpSecure = smtpPort === 465;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: smtpPort,
    secure: smtpSecure,
    connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS) || 10000,
    greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS) || 10000,
    socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS) || 15000,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  logger.info('[EMAIL] SMTP configured', {
    host: process.env.EMAIL_HOST,
    port: smtpPort,
    secure: smtpSecure,
  });
  // Run SMTP probe only when SMTP is the primary provider.
  if (!hasResendApi) {
    transporter
      .verify()
      .then(() => {
        logger.info('[EMAIL] SMTP verify successful');
      })
      .catch((error) => {
        logger.error('[EMAIL] SMTP verify failed', error);
      });
  }
}

if (!hasResendApi && !isSmtpConfigured) {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('[EMAIL] No email provider is configured in production. Emails are disabled.');
  } else {
    // В dev без настроек почты письма не отправляем, только логируем
    logger.warn('Email transport is not fully configured. Emails will be mocked in development.');
  }
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function normalizeRecipients(toValue) {
  if (Array.isArray(toValue)) return toValue.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  if (!toValue) return [];
  return [String(toValue).trim()].filter(Boolean);
}

async function sendViaResendApi(options) {
  const to = normalizeRecipients(options?.to);
  if (!to.length) {
    throw new Error('Resend API send failed: recipient is empty');
  }

  const payload = {
    from: String(options?.from || '').trim(),
    to,
    subject: String(options?.subject || ''),
    html: String(options?.html || ''),
  };
  if (options?.text) payload.text = String(options.text);

  try {
    const response = await axios.post(RESEND_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: EMAIL_SEND_TIMEOUT_MS,
    });
    return {
      messageId: response?.data?.id || response?.data?.messageId || null,
      provider: 'resend-api',
    };
  } catch (error) {
    const status = error?.response?.status;
    const details =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'unknown error';
    throw new Error(`Resend API send failed${status ? ` (${status})` : ''}: ${details}`);
  }
}

const sendMailSafe = async (options) => {
  if (!hasResendApi && (!isSmtpConfigured || !transporter)) {
    logger.warn('[EMAIL] send skipped: transporter is disabled', {
      to: options?.to,
      subject: options?.subject,
    });
    return;
  }

  logger.info('[EMAIL] sending', {
    to: options?.to,
    subject: options?.subject,
    provider: hasResendApi ? 'resend-api' : 'smtp',
  });

  const result = hasResendApi
    ? await sendViaResendApi(options)
    : await withTimeout(
      transporter.sendMail(options),
      EMAIL_SEND_TIMEOUT_MS,
      `SMTP send timeout after ${EMAIL_SEND_TIMEOUT_MS}ms`
    );

  logger.info('[EMAIL] sent', {
    to: options?.to,
    subject: options?.subject,
    messageId: result?.messageId,
    provider: result?.provider || 'smtp',
  });

  return result;
};

const sendConfirmationEmail = async (to, nickname, confirmLink, lang) => {
  const safeNickname = nickname || pickLang(lang, 'друг', 'friend');
  const safeLink = String(confirmLink || '');

  const strings = {
    title: pickLang(lang, 'Подтверждение регистрации GIVKOIN', 'GIVKOIN Registration Confirmation'),
    header: pickLang(lang, 'Подтверждение регистрации', 'Registration confirmation'),
    subheader: pickLang(lang, 'Остался один шаг, чтобы войти в Мироздание.', 'One more step to enter the Universe.'),
    hi: pickLang(lang, 'Привет', 'Hi'),
    thanks: pickLang(lang, 'Спасибо за регистрацию в GIVKOIN. Подтвердите email, чтобы активировать аккаунт.', 'Thanks for signing up for GIVKOIN. Please confirm your email to activate your account.'),
    cta: pickLang(lang, 'Подтвердить email', 'Confirm email'),
    ctaFallback: pickLang(lang, 'Если кнопка не работает, откройте ссылку:', 'If the button does not work, open the link:'),
    ignore: pickLang(lang, 'Если вы не регистрировались, просто игнорируйте это письмо.', 'If you did not sign up, just ignore this email.'),
    footer: pickLang(lang, 'Все права защищены.', 'All rights reserved.'),
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${strings.title}</title>
      </head>
      <body style="margin:0;padding:0;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:24px;">
          <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;">
            <div style="padding:28px 28px 22px 28px;background:linear-gradient(135deg,#0b1220 0%,#111c35 100%);">
              <div style="font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#ffffff;font-size:18px;">GIVKOIN</div>
              <div style="margin-top:10px;color:#dbeafe;font-size:22px;font-weight:800;line-height:1.25;">${strings.header}</div>
              <div style="margin-top:8px;color:rgba(255,255,255,0.65);font-size:14px;">${strings.subheader}</div>
            </div>

            <div style="padding:26px 28px 10px 28px;background:#0f172a;">
              <div style="color:#ffffff;font-size:16px;line-height:1.6;">
                <div>${strings.hi}, <strong>${safeNickname}</strong>!</div>
                <div style="margin-top:10px;color:rgba(255,255,255,0.78);">
                  ${strings.thanks}
                </div>

                <div style="margin:22px 0 18px 0;text-align:center;">
                  <a href="${safeLink}"
                    style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(90deg,#6ee7b7 0%,#34d399 100%);color:#052e1e;text-decoration:none;font-weight:800;font-size:15px;">
                    ${strings.cta}
                  </a>
                </div>

                <div style="margin-top:10px;color:rgba(255,255,255,0.55);font-size:12px;line-height:1.5;">
                  ${strings.ctaFallback}
                </div>
                <div style="margin-top:8px;word-break:break-all;">
                  <a href="${safeLink}" style="color:#93c5fd;text-decoration:underline;">${safeLink}</a>
                </div>

                <div style="margin-top:18px;color:rgba(255,255,255,0.55);font-size:12px;line-height:1.5;">
                  ${strings.ignore}
                </div>
              </div>
            </div>

            <div style="padding:18px 28px 22px 28px;background:#0b1220;border-top:1px solid rgba(255,255,255,0.08);">
              <div style="color:rgba(255,255,255,0.5);font-size:12px;line-height:1.5;">
                © ${new Date().getFullYear()} GIVKOIN. ${strings.footer}
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendTemplateEmail({
    templateKey: 'registration_confirm',
    to,
    lang,
    vars: {
      nickname: safeNickname,
      confirmLink: safeLink,
    },
    fallbackSubject: strings.title,
    fallbackHtml: html,
  });
};

module.exports = {
  sendConfirmationEmail,
  async sendComplaintNotification(to, nickname, hoursToRespond = 24, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const fallbackSubject = pickLang(lang, 'На вас поступила жалоба в GIVKOIN', 'A complaint has been filed in GIVKOIN');
    const fallbackHtml = `
        <h2>${pickLang(lang, 'Здравствуйте', 'Hello')}, ${safeName}!</h2>
        <p>${pickLang(lang, 'На ваш недавний чат поступила жалоба. У вас есть', 'A complaint has been filed about your recent chat. You have')} ${hoursToRespond} ${pickLang(lang, 'часов, чтобы оспорить решение.', 'hours to appeal the decision.')}</p>
        <p>${pickLang(lang, 'Зайдите в раздел истории чатов и нажмите «Разобраться». Если не оспорите вовремя, наказание применится автоматически.', 'Go to the chat history section and click “Resolve”. If you do not appeal in time, the penalty will be applied automatically.')}</p>
      `;

    await sendTemplateEmail({
      templateKey: 'complaint_notification',
      to,
      lang,
      vars: {
        nickname: safeName,
        hoursToRespond,
      },
      fallbackSubject,
      fallbackHtml,
    });
  },
  async sendBanOutcomeEmail(to, nickname, { banNumber, debuffPercent, stars, lives, action }, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const isConfirm = action === 'confirm';
    const subject = isConfirm
      ? pickLang(lang, 'Бан подтверждён в GIVKOIN', 'Ban confirmed in GIVKOIN')
      : pickLang(lang, 'Бан отменён в GIVKOIN', 'Ban cancelled in GIVKOIN');
    const details = isConfirm
      ? `<p>${pickLang(lang, 'Подтверждён бан №', 'Ban # confirmed: ')}${banNumber}. ${pickLang(lang, 'Текущие значения:', 'Current values:')}</p>
         <ul>
           <li>${pickLang(lang, 'Жизней осталось', 'Lives remaining')}: ${lives ?? '—'}</li>
           <li>${pickLang(lang, 'Звёзды душевности', 'Warmth stars')}: ${stars ?? '—'}</li>
           <li>${pickLang(lang, 'Дебафф', 'Debuff')}: -${debuffPercent || 0}% ${pickLang(lang, 'на 72 часа', 'for 72 hours')}</li>
         </ul>`
      : `<p>${pickLang(lang, 'Модератор отменил бан. Компенсация начислена, если это укладывается в месячный лимит.', 'A moderator cancelled the ban. Compensation has been credited if it fits within the monthly limit.')}</p>`;

    const fallbackHtml = `
        <h2>${pickLang(lang, 'Здравствуйте', 'Hello')}, ${safeName}!</h2>
        ${details}
        <p>${pickLang(lang, 'Пожалуйста, соблюдайте правила сообщества.', 'Please follow the community rules.')}</p>
      `;

    await sendTemplateEmail({
      templateKey: 'ban_outcome',
      to,
      lang,
      vars: {
        nickname: safeName,
        banNumber,
        debuffPercent: debuffPercent || 0,
        stars: stars ?? '—',
        lives: lives ?? '—',
        action,
        message: isConfirm
          ? pickLang(lang, 'Бан подтверждён.', 'Ban confirmed.')
          : pickLang(lang, 'Бан отменён.', 'Ban cancelled.'),
      },
      fallbackSubject: subject,
      fallbackHtml,
    });
  },
  async sendBattleResultEmail(to, nickname, { result, damageLight, damageDark, startedAt, endedAt }, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const outcome =
      result === 'light'
        ? pickLang(lang, 'Победа Света! Древо защищено.', 'Victory of Light! The Tree is protected.')
        : result === 'dark'
        ? pickLang(lang, 'Поражение. Мрак нанёс урон Древу.', 'Defeat. Darkness has damaged the Tree.')
        : pickLang(lang, 'Бой завершён.', 'Battle ended.');
    const fallbackSubject = pickLang(lang, 'Итог боя GIVKOIN', 'GIVKOIN Battle Results');
    const fallbackHtml = `
        <h2>${pickLang(lang, 'Здравствуйте', 'Hello')}, ${safeName}!</h2>
        <p>${outcome}</p>
        <ul>
          <li>${pickLang(lang, 'Урон Света', 'Light damage')}: ${damageLight ?? '—'}</li>
          <li>${pickLang(lang, 'Урон Мрака', 'Darkness damage')}: ${damageDark ?? '—'}</li>
          <li>${pickLang(lang, 'Старт', 'Start')}: ${startedAt ?? '—'}</li>
          <li>${pickLang(lang, 'Окончание', 'End')}: ${endedAt ?? '—'}</li>
        </ul>
        <p>${pickLang(lang, 'Спасибо за участие в защите Древа.', 'Thank you for taking part in protecting the Tree.')}</p>
      `;

    await sendTemplateEmail({
      templateKey: 'battle_result',
      to,
      lang,
      vars: {
        nickname: safeName,
        outcome,
        damageLight: damageLight ?? '—',
        damageDark: damageDark ?? '—',
        startedAt: startedAt ?? '—',
        endedAt: endedAt ?? '—',
      },
      fallbackSubject,
      fallbackHtml,
    });
  },
  async sendLotteryWinEmail(to, nickname, prizeOrDetails, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const details =
      prizeOrDetails && typeof prizeOrDetails === 'object'
        ? prizeOrDetails
        : { prize: prizeOrDetails };
    const rawPrize = details?.prize;
    const prizeLabel =
      typeof rawPrize === 'number'
        ? `${rawPrize} K`
        : String(rawPrize || 'не указан');
    const winningNumber = String(details?.winningNumber || '').trim();
    const drawDate = String(details?.drawDate || '').trim();
    const resultUrl = String(details?.resultUrl || '').trim();
    const matches = Number(details?.matches);
    const matchesBlock =
      Number.isFinite(matches) && matches > 0
        ? `<p>${pickLang(lang, 'Максимум совпадений по вашим билетам', 'Max matches in your tickets')}: <strong>${matches}</strong>.</p>`
        : '';
    const winningBlock = winningNumber
      ? `<p>${pickLang(lang, 'Победившие числа', 'Winning numbers')}: <strong>${winningNumber}</strong>.</p>`
      : '';
    const drawDateBlock = drawDate
      ? `<p>${pickLang(lang, 'Дата розыгрыша', 'Draw date')}: <strong>${drawDate}</strong>.</p>`
      : '';
    const resultLinkBlock = resultUrl
      ? `<p><a href="${resultUrl}">${pickLang(lang, 'Открыть результаты лотереи', 'Open lottery results')}</a></p>`
      : '';
    const fallbackSubject = pickLang(lang, 'Вы выиграли в лотерее GIVKOIN', 'You won the GIVKOIN lottery');
    const fallbackHtml = `
        <h2>${pickLang(lang, 'Здравствуйте', 'Hello')}, ${safeName}!</h2>
        <p>${pickLang(lang, 'Вы выиграли приз', 'You won a prize')}: <strong>${prizeLabel}</strong>.</p>
        ${winningBlock}
        ${matchesBlock}
        ${drawDateBlock}
        <p>${pickLang(lang, 'Награда начислена на ваш аккаунт.', 'The reward has been credited to your account.')}</p>
        ${resultLinkBlock}
      `;

    await sendTemplateEmail({
      templateKey: 'lottery_win',
      to,
      lang,
      vars: {
        nickname: safeName,
        prize: prizeLabel,
        winningNumber,
        drawDate,
        resultUrl,
        matches: Number.isFinite(matches) ? matches : '',
      },
      fallbackSubject,
      fallbackHtml,
    });
  },
  async sendStarsMilestoneEmail(to, nickname, { stars }, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const s = Number(stars) || 0;
    const fallbackSubject = pickLang(lang, `Поздравляем! ${s} звёзд душевности`, `Congratulations! ${s} warmth stars`);
    const fallbackHtml = `
        <h2>${pickLang(lang, 'Здравствуйте', 'Hello')}, ${safeName}!</h2>
        <p>${pickLang(lang, 'Вы достигли', 'You reached')} ${s} ${pickLang(lang, 'звёзд душевности', 'warmth stars')}.</p>
        <p>${pickLang(lang, 'Награда начислена на ваш аккаунт.', 'The reward has been credited to your account.')}</p>
      `;

    await sendTemplateEmail({
      templateKey: 'stars_milestone',
      to,
      lang,
      vars: {
        nickname: safeName,
        stars: s,
      },
      fallbackSubject,
      fallbackHtml,
    });
  },
  async sendGenericEventEmail(to, subject, html) {
    if (!to) return;
    const from = process.env.FROM_EMAIL || process.env.EMAIL_USER;
    const fromName = process.env.FROM_NAME || 'GIVKOIN';
    await sendMailSafe({
      from: `${fromName} <${from}>`,
      to,
      subject,
      html,
    });
  },

  async sendUnstableConnectionPenaltyEmail(to, nickname, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const fallbackSubject = pickLang(lang, 'Штраф за нестабильное соединение - GIVKOIN', 'Unstable connection penalty - GIVKOIN');
    const fallbackHtml = pickLang(
      lang,
      `<h2>Здравствуйте, ${safeName}!</h2><p>Система зафиксировала нестабильное соединение. Возможен штраф по правилам проекта.</p>`,
      `<h2>Hello, ${safeName}!</h2><p>The system detected an unstable connection. A penalty may be applied according to the project rules.</p>`
    );

    await sendTemplateEmail({
      templateKey: 'unstable_connection_penalty',
      to,
      lang,
      vars: { nickname: safeName },
      fallbackSubject,
      fallbackHtml,
    });
  },

  async sendSolarChargeReminderEmail(to, nickname, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const fallbackSubject = pickLang(lang, 'Напоминание о солнечном заряде - GIVKOIN', 'Solar charge reminder - GIVKOIN');
    const fallbackHtml = pickLang(
      lang,
      `<h2>Здравствуйте, ${safeName}!</h2><p>Напоминание: не забудьте про солнечный заряд.</p>`,
      `<h2>Hello, ${safeName}!</h2><p>Reminder: don’t forget about your solar charge.</p>`
    );

    await sendTemplateEmail({
      templateKey: 'solar_charge_reminder',
      to,
      lang,
      vars: { nickname: safeName },
      fallbackSubject,
      fallbackHtml,
    });
  },

  async sendDarknessAttackEmail(to, nickname, battleUrl, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const safeUrl = String(battleUrl || '').trim();
    const fallbackSubject = pickLang(
      lang,
      'Мрак напал на Древо — срочно заходите в бой',
      'Darkness attacked the Tree — enter the battle now'
    );
    const fallbackHtml = pickLang(
      lang,
      `<h2>Здравствуйте, ${safeName}!</h2><p>Мрак напал на Древо. Срочно заходите в бой:</p><p><a href="${safeUrl}">${safeUrl}</a></p>`,
      `<h2>Hello, ${safeName}!</h2><p>Darkness attacked the Tree. Enter the battle now:</p><p><a href="${safeUrl}">${safeUrl}</a></p>`
    );

    await sendTemplateEmail({
      templateKey: 'darkness_attack',
      to,
      lang,
      vars: { nickname: safeName, battleUrl: safeUrl },
      fallbackSubject,
      fallbackHtml,
    });
  },

  async sendNightShiftPenaltyEmail(to, nickname, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const fallbackSubject = pickLang(lang, 'Штраф за Ночную Смену в GIVKOIN', 'Night Shift penalty in GIVKOIN');
    const fallbackHtml = pickLang(
      lang,
      `<h2>Здравствуйте, ${safeName}!</h2><p>По итогам ночной смены был применён штраф согласно правилам.</p>`,
      `<h2>Hello, ${safeName}!</h2><p>A Night Shift penalty has been applied according to the rules.</p>`
    );

    await sendTemplateEmail({
      templateKey: 'night_shift_penalty',
      to,
      lang,
      vars: { nickname: safeName },
      fallbackSubject,
      fallbackHtml,
    });
  },

  async sendMultiAccountReviewEmail(to, nickname, clusterSize, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');
    const safeCluster = Number(clusterSize) || 0;
    const fallbackSubject = pickLang(lang, 'Проверка аккаунта - GIVKOIN', 'Account review - GIVKOIN');
    const fallbackHtml = pickLang(
      lang,
      `<h2>Здравствуйте, ${safeName}!</h2><p>Система обнаружила возможные связанные аккаунты. Количество: <strong>${safeCluster}</strong>.</p>`,
      `<h2>Hello, ${safeName}!</h2><p>The system detected possible linked accounts. Count: <strong>${safeCluster}</strong>.</p>`
    );

    await sendTemplateEmail({
      templateKey: 'multi_account_review',
      to,
      lang,
      vars: { nickname: safeName, clusterSize: safeCluster },
      fallbackSubject,
      fallbackHtml,
    });
  },

  async sendPasswordRecoveryEmail(to, nickname, resetLink, lang) {
    if (!to) return;
    const safeName = nickname || pickLang(lang, 'друг', 'friend');

    const fallbackSubject = pickLang(lang, 'Восстановление пароля GIVKOIN', 'GIVKOIN Password recovery');
    const fallbackHtml = `
        <h2>${pickLang(lang, 'Здравствуйте', 'Hello')}, ${safeName}!</h2>
        <p>${pickLang(lang, 'Вы запросили восстановление пароля.', 'You requested a password reset.')}</p>
        <p>${pickLang(lang, 'Для сброса пароля перейдите по ссылке (действительна 1 час):', 'To reset your password, follow the link (valid for 1 hour):')}</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>${pickLang(lang, 'Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.', 'If you did not request a password reset, just ignore this email.')}</p>
      `;

    await sendTemplateEmail({
      templateKey: 'password_recovery',
      to,
      lang,
      vars: {
        nickname: safeName,
        resetLink,
      },
      fallbackSubject,
      fallbackHtml,
    });
  },
};

