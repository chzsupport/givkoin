const { isComplaintBlocked, applyPenalty } = require('../utils/penalties');
const { sendComplaintNotification, sendBanOutcomeEmail } = require('../services/emailService');
const { updateEntityMoodForUser } = require('../services/entityMoodService');
const { getNumericSettingValue } = require('../services/settingsRegistryService');
const { recordTransaction, awardReferralBlessingExternal } = require('../services/kService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const chatService = require('../services/chatService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const DEBUFF_DURATION_HOURS = 72;
const AUTO_RESOLVE_HOURS = 24;
const COMPLAINT_BLOCK_DURATION_HOURS = 72;
const FALSE_REPORT_WINDOW_HOURS = 48;
const FALSE_REPORT_TOTAL_THRESHOLD = 15;
const FALSE_REPORT_FALSE_THRESHOLD = 7;
const COMPENSATION_MONTH_LIMIT = 15;

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'object') {
    if (value._id !== undefined) return toId(value._id, depth + 1);
    if (value.id !== undefined) return toId(value.id, depth + 1);
    if (value.value !== undefined) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const asString = value.toString();
      if (asString && asString !== '[object Object]') return asString;
    }
  }
  return '';
}

async function findAppealById(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at')
    .eq('model', 'Appeal')
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;
  return { _id: data.id, ...data.data, createdAt: data.created_at };
}

async function findPendingAppealByUser(againstUser) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'Appeal')
    .limit(500);
  if (error || !Array.isArray(data)) return null;
  return data.find((row) => {
    const d = row.data || {};
    return String(d.againstUser) === String(againstUser) && d.status === 'pending';
  }) || null;
}

async function insertAppeal(doc) {
  const supabase = getSupabaseClient();
  const id = `app_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  await supabase.from(DOC_TABLE).insert({
    model: 'Appeal',
    id,
    data: doc,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return { _id: id, ...doc };
}

async function updateAppeal(id, patch) {
  const supabase = getSupabaseClient();
  const { data: existing, error: findError } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'Appeal')
    .eq('id', String(id))
    .maybeSingle();
  if (findError || !existing) return null;
  
  const nextData = { ...existing.data, ...patch };
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: nextData, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return { _id: data.id, ...data.data };
}

async function listExpiredAppeals() {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'Appeal')
    .limit(1000);
  if (error || !Array.isArray(data)) return [];
  
  return data.filter((row) => {
    const d = row.data || {};
    return d.status === 'pending' && d.autoResolveAt && d.autoResolveAt <= nowIso;
  }).map((row) => ({ _id: row.id, ...row.data }));
}

async function countAppeals(filters) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'Appeal')
    .limit(5000);
  if (error || !Array.isArray(data)) return 0;
  
  return data.filter((row) => {
    const d = row.data || {};
    if (filters.againstUser && String(d.againstUser) !== String(filters.againstUser)) return false;
    if (filters.complainant && String(d.complainant) !== String(filters.complainant)) return false;
    if (filters.status && d.status !== filters.status) return false;
    if (filters.resolvedAt && d.resolvedAt && d.resolvedAt < filters.resolvedAt) return false;
    if (filters.createdAt && d.createdAt && d.createdAt < filters.createdAt) return false;
    return true;
  }).length;
}

function mapChatRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    participants: Array.isArray(row.participants) ? row.participants : [],
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    duration: Number(row.duration || 0),
    complaint: row.complaint && typeof row.complaint === 'object' ? row.complaint : null,
  };
}

async function getChatById(chatId) {
  const id = toId(chatId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function updateChatById(chatId, patch) {
  const id = toId(chatId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', String(id))
    .select('*')
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function listLastChatMessages(chatId, limit = 50) {
  const messages = await chatService.listMessages(chatId, { limit });
  return messages.slice().reverse().map((message) => ({
    id: message._id,
    sender_id: message.senderId,
    original_text: message.originalText,
    translated_text: message.translatedText,
    created_at: message.createdAt,
  }));
}

async function getUserRowById(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
  const id = toId(userId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(id);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,data,email,nickname')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function createAppeal(req, res, next) {
  try {
    const { chatId, reason, description } = req.body || {};
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
    if (!chatId || !reason) {
      return res.status(400).json({
        message: pickLang(userLang, 'chatId и reason обязательны', 'chatId and reason are required'),
      });
    }

    const chat = await getChatById(chatId);
    if (!chat) {
      return res.status(404).json({ message: pickLang(userLang, 'Чат не найден', 'Chat not found') });
    }

    if (!req.user) {
      return res.status(401).json({ message: pickLang(userLang, 'Требуется авторизация', 'Authorization required') });
    }

    const userId = req.user._id;
    const isParticipant = (chat.participants || []).some((p) => p?.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: pickLang(userLang, 'Вы не участник чата', 'You are not a participant of this chat') });
    }

    if (chat.status !== 'active') {
      return res.status(400).json({
        message: pickLang(userLang, 'Чат уже завершен или имеет жалобу', 'Chat is already closed or already has a complaint'),
      });
    }

    const userRow = await getUserRowById(userId);
    if (!userRow) {
      return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
    }
    const userData = getUserData(userRow);

    if (isComplaintBlocked({ complaintBlockedUntil: userData.complaintBlockedUntil })) {
      return res.status(403).json({
        message: pickLang(userLang, 'Подача жалоб временно заблокирована', 'Submitting complaints is temporarily blocked'),
        until: userData.complaintBlockedUntil,
      });
    }

    const hasPendingAgainst = await findPendingAppealByUser(userId);
    if (hasPendingAgainst) {
      return res.status(403).json({
        message: pickLang(userLang, 'На вас идёт проверка апелляции, жаловаться пока нельзя', 'Your appeal is under review, you cannot submit complaints right now'),
      });
    }

    const currentChips = Number(userData.complaintChips ?? 0) || 0;
    if (currentChips <= 0) {
      return res.status(400).json({ message: pickLang(userLang, 'Фишки для жалоб закончились', 'No complaint chips left') });
    }

    const opponent = (chat.participants || []).find((p) => p?.toString() !== userId.toString());
    const opponentUserId = toId(opponent);
    const opponentRow = opponentUserId ? await getUserRowById(opponentUserId) : null;

    // Создаём Appeal (pending) сразу, но без переписки (приватность до апелляции)
    const now = new Date();
    const appeal = await insertAppeal({
      chat: chatId,
      complainant: userId,
      againstUser: opponent,
      reason,
      description,
      messagesSnapshot: [],
      autoResolveAt: hoursFromNow(AUTO_RESOLVE_HOURS).toISOString(),
      status: 'pending',
    });

    // Закрываем чат после жалобы
    const startedAt = chat.startedAt ? new Date(chat.startedAt) : now;
    const durationMs = now.getTime() - startedAt.getTime();
    const durationSeconds = Math.floor(Math.max(0, durationMs) / 1000);
    await updateChatById(chatId, {
      status: 'complained',
      ended_at: now.toISOString(),
      duration: durationSeconds,
      complaint: {
        from: String(userId),
        to: String(opponentUserId || opponent || ''),
        reason: reason.trim(),
        createdAt: now.toISOString(),
        messagesSnapshot: [],
        autoResolveAt: appeal.autoResolveAt,
        appealId: String(appeal._id),
      },
    });
    await chatService.markForAppeal(chatId, appeal.autoResolveAt);

    // -1 фишка у жалующегося
    const remainingChips = Math.max(0, currentChips - 1);
    await updateUserDataById(userId, { complaintChips: remainingChips });

    // Ссорившиеся: не подбираются 7 дней
    const blockedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const blockedUntilIso = blockedUntil.toISOString();
    const currentBlocked = Array.isArray(userData.blockedUsers) ? userData.blockedUsers : [];
    const opponentData = getUserData(opponentRow);
    const opponentBlocked = Array.isArray(opponentData.blockedUsers) ? opponentData.blockedUsers : [];

    const nextBlocked = [
      ...currentBlocked.filter((b) => String(b?.userId) !== String(opponentUserId)),
      { userId: String(opponentUserId), until: blockedUntilIso, reason: 'quarrel' },
    ];
    const nextOpponentBlocked = [
      ...opponentBlocked.filter((b) => String(b?.userId) !== String(userId)),
      { userId: String(userId), until: blockedUntilIso, reason: 'quarrel' },
    ];

    await Promise.all([
      updateUserDataById(userId, { blockedUsers: nextBlocked }),
      opponentUserId ? updateUserDataById(opponentUserId, { blockedUsers: nextOpponentBlocked }) : null,
    ]);

    const opponentEmail = String(opponentRow?.email || '').trim();
    const opponentNickname = String(opponentRow?.nickname || '').trim();
    const opponentLang = (opponentRow?.language || opponentRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
    if (opponentEmail) {
      await sendComplaintNotification(opponentEmail, opponentNickname, AUTO_RESOLVE_HOURS, opponentLang).catch((err) => {
        console.error('Failed to send complaint notification email:', err);
      });
    }

    return res.status(201).json({ ok: true, appealId: appeal._id, remainingChips });
  } catch (error) {
    return next(error);
  }
}

async function resolveAppeal(req, res, next) {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
    const appeal = await findAppealById(id);
    if (!appeal) {
      return res.status(404).json({ message: pickLang(userLang, 'Апелляция не найдена', 'Appeal not found') });
    }
    if (appeal.status !== 'pending') {
      return res.status(400).json({ message: pickLang(userLang, 'Апелляция уже обработана', 'Appeal has already been processed') });
    }
    if (!['confirm', 'cancel'].includes(action)) {
      return res.status(400).json({ message: 'action must be confirm|cancel' });
    }

    const againstUserId = toId(appeal.againstUser);
    const againstRow = await getUserRowById(againstUserId);
    if (!againstRow) {
      return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
    }
    const againstData = getUserData(againstRow);
    const complainantId = toId(appeal.complainant);
    const complainantRow = complainantId ? await getUserRowById(complainantId) : null;
    const complainantData = getUserData(complainantRow);

    if (action === 'confirm') {
      const penalty = await applyPenalty(againstUserId);
      await updateAppeal(id, {
        status: 'resolved',
        penaltyApplied: true,
        resolvedAt: new Date().toISOString(),
      });
      if (againstRow?.email) {
        const againstLang = (againstRow?.language || againstRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
        await sendBanOutcomeEmail(againstRow.email, againstRow.nickname, {
          banNumber: penalty.banNumber,
          debuffPercent: penalty.debuffPercent,
          stars: penalty.stars,
          lives: penalty.lives,
          action,
        }, againstLang).catch((err) => {
          console.error('Failed to send ban outcome email:', err);
        });
      }
      return res.json({
        ok: true,
        status: 'resolved',
        penalty,
        lives: penalty.lives,
        stars: penalty.stars,
        debuffActiveUntil: penalty.debuffActiveUntil,
      });
    }

    if (action === 'cancel') {
      const compensationAmount = await getNumericSettingValue('K_APPEAL_COMPENSATION', 100);
      const monthAgo = hoursFromNow(-24 * 30).toISOString();
      const compensationCount = await countAppeals({
        againstUser: againstUserId,
        status: 'rejected',
        resolvedAt: monthAgo,
      });
      if (compensationCount < COMPENSATION_MONTH_LIMIT) {
        const nextK = (Number(againstData.k) || 0) + compensationAmount;
        await updateUserDataById(againstUserId, { k: nextK });
        await recordTransaction({
          userId: againstUserId,
          type: 'appeal_compensation',
          direction: 'credit',
          amount: compensationAmount,
          currency: 'K',
          description: 'Компенсация за ложную жалобу',
          relatedEntity: id,
        }).catch(() => null);
        awardReferralBlessingExternal({
          receiverUserId: againstUserId,
          amount: compensationAmount,
          sourceType: 'appeal_compensation',
          relatedEntity: id,
        }).catch(() => null);
      }
      await updateAppeal(id, {
        status: 'rejected',
        resolvedAt: new Date().toISOString(),
      });
      if (againstRow?.email) {
        await sendBanOutcomeEmail(againstRow.email, againstRow.nickname, { action }).catch((err) => {
          console.error('Failed to send ban outcome email:', err);
        });
      }
      if (complainantRow) {
        const since = hoursFromNow(-FALSE_REPORT_WINDOW_HOURS).toISOString();
        const total = await countAppeals({ complainant: complainantId, createdAt: since });
        const rejected = await countAppeals({
          complainant: complainantId,
          status: 'rejected',
          resolvedAt: since,
        });
        if (total >= FALSE_REPORT_TOTAL_THRESHOLD && rejected >= FALSE_REPORT_FALSE_THRESHOLD) {
          await updateUserDataById(complainantId, { complaintBlockedUntil: hoursFromNow(COMPLAINT_BLOCK_DURATION_HOURS).toISOString() });
        }
      }
      const freshAgainst = await getUserRowById(againstUserId);
      const freshData = getUserData(freshAgainst);
      return res.json({ ok: true, status: 'rejected', k: freshData.k });
    }
  } catch (error) {
    return next(error);
  }
}

async function submitAppealText(req, res, next) {
  try {
    const { id } = req.params;
    const { appealText } = req.body || {};
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
    if (!appealText || !appealText.trim()) {
      return res.status(400).json({ message: pickLang(userLang, 'Текст апелляции обязателен', 'Appeal text is required') });
    }

    // Сначала проверяем - это appealId или chatId
    let appeal = await findAppealById(id);
    let chat;

    if (!appeal) {
      // Это chatId - создаем новый Appeal при оспаривании
      chat = await getChatById(id);
      if (!chat || !chat.complaint) {
        return res.status(404).json({ message: pickLang(userLang, 'Чат с жалобой не найден', 'Chat with complaint was not found') });
      }

      if (!req.user || String(chat.complaint.to) !== String(req.user._id)) {
        return res.status(403).json({ message: pickLang(userLang, 'Нет прав на подачу апелляции', 'Not allowed to submit an appeal') });
      }

      // Если Appeal уже был создан при жалобе — обновляем его (и прикрепляем переписку)
      if (chat.complaint.appealId) {
        const existing = await findAppealById(chat.complaint.appealId);
        if (existing) {
          if (!req.user || String(existing.againstUser) !== String(req.user._id)) {
            return res.status(403).json({ message: pickLang(userLang, 'Нет прав на подачу апелляции', 'Not allowed to submit an appeal') });
          }

          const messages = await listLastChatMessages(id, 50);
          const snapshot = messages
            .slice()
            .reverse()
            .map((m) => ({
              sender: String(m.sender_id ?? 'unknown'),
              content: String(m.original_text ?? m.translated_text ?? ''),
              sentAt: m.created_at,
            }));

          await updateAppeal(chat.complaint.appealId, {
            appealText: appealText.trim(),
            appealedAt: new Date().toISOString(),
            messagesSnapshot: snapshot,
          });

          const nextComplaint = { ...(chat.complaint || {}), messagesSnapshot: snapshot };
          await updateChatById(id, { complaint: nextComplaint });
          await chatService.cleanupTranscript(id);

          return res.json({ ok: true, appealId: existing._id, appealedAt: new Date().toISOString() });
        }
      }

      // Фоллбек: создаем Appeal из данных chat.complaint
      const messages = await listLastChatMessages(id, 50);
      const snapshot = messages
        .slice()
        .reverse()
        .map((m) => ({
          sender: String(m.sender_id ?? 'unknown'),
          content: String(m.original_text ?? m.translated_text ?? ''),
          sentAt: m.created_at,
        }));

      appeal = await insertAppeal({
        chat: id,
        complainant: chat.complaint.from,
        againstUser: chat.complaint.to,
        reason: chat.complaint.reason,
        messagesSnapshot: snapshot,
        appealText: appealText.trim(),
        appealedAt: new Date().toISOString(),
        autoResolveAt: chat.complaint.autoResolveAt,
        status: 'pending',
      });

      // Обновляем chat.complaint с appealId
      chat.complaint.appealId = appeal._id;
      chat.complaint.messagesSnapshot = snapshot;
      await updateChatById(id, { complaint: chat.complaint });
      await chatService.cleanupTranscript(id);

      return res.json({ ok: true, appealId: appeal._id, appealedAt: appeal.appealedAt });
    }

    // Appeal уже существует - обновляем текст оспаривания
    if (!req.user || String(appeal.againstUser) !== String(req.user._id)) {
      return res.status(403).json({ message: pickLang(userLang, 'Нет прав на подачу апелляции', 'Not allowed to submit an appeal') });
    }

    if (appeal.status !== 'pending') {
      return res.status(400).json({ message: pickLang(userLang, 'Апелляция уже обработана', 'Appeal has already been processed') });
    }

    await updateAppeal(id, {
      appealText: appealText.trim(),
      appealedAt: new Date().toISOString(),
    });

    return res.json({ ok: true, appealId: appeal._id, appealedAt: new Date().toISOString() });
  } catch (error) {
    return next(error);
  }
}

async function autoResolveExpiredAppeals() {
  const expired = await listExpiredAppeals();
  for (const appeal of expired) {
    try {
      const againstUserId = toId(appeal.againstUser);
      const againstRow = await getUserRowById(againstUserId);
      if (!againstRow) {
        await updateAppeal(appeal._id, {
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          penaltyApplied: true,
        });
        continue;
      }
      const penalty = await applyPenalty(againstUserId);
      await updateAppeal(appeal._id, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        penaltyApplied: true,
      });

      updateEntityMoodForUser(appeal.againstUser).catch(() => { });
      if (againstRow?.email) {
        sendBanOutcomeEmail(againstRow.email, againstRow.nickname, {
          banNumber: penalty.banNumber,
          debuffPercent: penalty.debuffPercent,
          stars: penalty.stars,
          lives: penalty.lives,
          action: 'confirm',
        }).catch(() => { });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('autoResolveExpiredAppeals error', e);
    }
  }
}

async function clearExpiredDebuffs() {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseClient();
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('users')
      .select('id,data')
      .range(from, from + pageSize - 1);

    if (error || !Array.isArray(rows) || !rows.length) {
      break;
    }

    for (const row of rows) {
      const userId = String(row?.id || '').trim();
      if (!userId) continue;
      const data = row?.data && typeof row.data === 'object' ? row.data : {};
      const until = data.debuffActiveUntil ? new Date(data.debuffActiveUntil) : null;
      if (!until || Number.isNaN(until.getTime())) continue;
      if (until.toISOString() > nowIso) continue;

      await updateUserDataById(userId, {
        debuffPercent: 0,
        debuffActiveUntil: null,
        banCount: 0,
      });

      updateEntityMoodForUser(userId).catch(() => { });
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }
}

module.exports = {
  createAppeal,
  resolveAppeal,
  submitAppealText,
  autoResolveExpiredAppeals,
  clearExpiredDebuffs,
};

