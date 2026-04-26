const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { translateMessage } = require('./translationService');
const chatTranscriptService = require('./chatTranscriptService');

function getLanguageFromUserRow(row) {
  if (!row) return null;
  if (row.language) return String(row.language);
  const json = row.data && typeof row.data === 'object' ? row.data : {};
  return json.language ? String(json.language) : null;
}

async function getUserLanguage(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,language,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error || !data) return null;
  return getLanguageFromUserRow(data);
}

async function getUserLanguages(userIds = []) {
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,language,data')
    .in('id', ids);
  if (error || !Array.isArray(data)) return new Map();

  return new Map(data.map((row) => [String(row.id), getLanguageFromUserRow(row)]));
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

async function getChatRowById(chatId) {
  const id = toId(chatId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function normalizeParticipantsIds(list) {
  if (!Array.isArray(list)) return [];
  return list.map((id) => String(id)).filter(Boolean);
}

function mapMessageRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    originalText: row.original_text,
    translatedText: row.translated_text,
    originalLang: row.original_lang,
    targetLang: row.target_lang,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

async function createMessage({ chatId, senderId, content, language, targetLanguage, chatContext = null }) {
  if (!chatId || !senderId || !content) {
    throw new Error('chatId, senderId и content обязательны');
  }

  let participants = normalizeParticipantsIds(chatContext?.participants);
  let chatStatus = chatContext?.status || null;
  let participantLanguages = chatContext?.participantLanguages && typeof chatContext.participantLanguages === 'object'
    ? chatContext.participantLanguages
    : {};

  if (!participants.length || !chatStatus) {
    const chatRow = await getChatRowById(chatId);
    if (!chatRow) {
      throw new Error('Chat not found');
    }
    chatStatus = chatRow.status;
    participants = normalizeParticipantsIds(chatRow.participants);
  }

  if (chatStatus !== 'active') {
    throw new Error('Chat is not active');
  }

  const receiverId = participants.find((p) => String(p) !== String(senderId));

  let sourceLang = language || null;
  let targetLang = targetLanguage || 'ru';
  const missingLanguageIds = [];

  if (!sourceLang) {
    sourceLang = participantLanguages[String(senderId)] || null;
    if (!sourceLang) {
      missingLanguageIds.push(String(senderId));
    }
  }

  let receiverLang = null;
  if (receiverId && !targetLanguage) {
    receiverLang = participantLanguages[String(receiverId)] || null;
    if (!receiverLang) {
      missingLanguageIds.push(String(receiverId));
    }
  }

  if (missingLanguageIds.length) {
    const languageMap = await getUserLanguages(missingLanguageIds);
    if (!sourceLang) {
      sourceLang = languageMap.get(String(senderId)) || null;
    }
    if (!receiverLang && receiverId) {
      receiverLang = languageMap.get(String(receiverId)) || null;
    }
  }

  sourceLang = sourceLang || 'ru';

  if (receiverId) {
    if (!receiverLang && !targetLanguage) {
      receiverLang = await getUserLanguage(receiverId);
    }
    if (receiverLang) {
      targetLang = receiverLang;
    }
  }

  let translatedText = null;

  // Translate ONLY if source != target
  if (sourceLang !== targetLang) {
    const translationResult = await translateMessage(content, sourceLang, targetLang);
    translatedText = translationResult.translatedText;
  }

  const messageId = crypto.randomBytes(12).toString('hex');
  const nowIso = new Date().toISOString();
  const message = {
    _id: messageId,
    chatId: String(chatId),
    senderId: String(senderId),
    originalText: String(content),
    translatedText,
    originalLang: sourceLang,
    targetLang,
    status: 'sent',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await chatTranscriptService.appendMessage(chatId, message);

  return message;
}

module.exports = {
  createMessage,
  captureSnapshot: chatTranscriptService.captureSnapshot,
  listMessages: chatTranscriptService.listMessages,
  markForAppeal: chatTranscriptService.markForAppeal,
  persistTranscript: chatTranscriptService.persistTranscript,
  cleanupTranscript: chatTranscriptService.cleanupTranscript,
  ensureTranscriptState: chatTranscriptService.ensureTranscriptState,
  touchChatActivity: chatTranscriptService.touchChatActivity,
  getTranscriptState: chatTranscriptService.getTranscriptState,
};
