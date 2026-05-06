const { askOllama } = require('./ollamaClient');

const fs = require('fs');
const path = require('path');

const DEFAULT_KNOWLEDGE_FILE = path.join(__dirname, '..', 'knowledge', 'entity_knowledge_ru.md');
const KNOWLEDGE_FILE = process.env.ENTITY_KNOWLEDGE_FILE || DEFAULT_KNOWLEDGE_FILE;

const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;
let _knowledgeCache = { text: '', readAt: 0 };

const QUICK_ANSWER_TIMEOUT_MS = Number(process.env.ENTITY_ASK_TIMEOUT_MS) || 12000;

const OLLAMA_OPTIONS_PROJECT = {
  temperature: 0.6,
  top_p: 0.9,
  num_predict: 180,
};

const OLLAMA_OPTIONS_GENERAL = {
  temperature: 0.7,
  top_p: 0.9,
  num_predict: 90,
};

function safeReadKnowledge() {
  const now = Date.now();
  if (_knowledgeCache.text && now - _knowledgeCache.readAt < KNOWLEDGE_CACHE_TTL_MS) {
    return _knowledgeCache.text;
  }

  try {
    const raw = fs.readFileSync(KNOWLEDGE_FILE, 'utf8');
    const text = (raw || '').toString().trim();
    _knowledgeCache = { text, readAt: now };
    return text;
  } catch (e) {
    _knowledgeCache = { text: '', readAt: now };
    return '';
  }
}

function tokenizeRu(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 40);
}

function splitKnowledgeIntoSections(text) {
  const raw = (text || '').toString();
  const parts = raw.split(/\n(?=##\s)/g);
  if (parts.length <= 1) return [raw];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function pickRelevantKnowledge({ knowledgeText, question, maxSections = 2 }) {
  const sections = splitKnowledgeIntoSections(knowledgeText);
  const qTokens = new Set(tokenizeRu(question));
  if (qTokens.size === 0) return sections.slice(0, maxSections);

  const scored = sections
    .map((sec) => {
      const secTokens = tokenizeRu(sec);
      let score = 0;
      for (const t of secTokens) {
        if (qTokens.has(t)) score += 1;
      }
      return { sec, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored.filter((x) => x.score > 0).slice(0, maxSections).map((x) => x.sec);
  if (best.length) return best;
  return sections.slice(0, maxSections);
}

function buildFallbackAnswer(question) {
  const q = (question || '').toString().trim();
  if (!q) return 'Спроси, пожалуйста, что именно ты хочешь найти в GIVKOIN — я подскажу.';
  return 'Я не уверена. Переформулируй вопрос чуть проще — отвечу коротко.';
}

function getToneByMood(mood) {
  if (mood === 'happy') {
    return [
      'Тон: дружелюбная, игривая, тёплая.',
      'Можно немного лёгкого юмора, но без панибратства.',
      'Фразы короткие, живые.',
    ].join('\n');
  }
  if (mood === 'sad') {
    return [
      'Тон: немного грустная, мягкая, спокойная.',
      'Не дави на пользователя, поддержи, но всё равно помоги по делу.',
      'Фразы короткие, без длинных вступлений.',
    ].join('\n');
  }
  return [
    'Тон: спокойная, уверенная, понятная.',
    'Без лишних эмоций, но дружелюбно.',
    'Фразы короткие, деловой стиль без канцелярщины.',
  ].join('\n');
}

function buildSystemPrompt({ mood, knowledgeText, context, wantGivkoin }) {
  const knowledge = (knowledgeText || '').toString().trim();
  const tone = getToneByMood(mood);

  const ctx = context && typeof context === 'object' ? context : null;
  const ctxLines = ctx
    ? [
        'КОНТЕКСТ СОСТОЯНИЯ (внутренний):',
        `- Сытость: ${ctx.isSated ? 'сыта' : 'голодна'}`,
        `- Активность: ${Number.isFinite(ctx.corePercent) ? `${Math.round(ctx.corePercent)}%` : 'неизвестно'}`,
        `- Действия: ${Number.isFinite(ctx.confirmedCount) ? ctx.confirmedCount : 'неизвестно'}`,
        `- Дебафф: ${ctx.activeDebuff ? 'да' : 'нет'}`,
        'Если настроение грустное, ты можешь коротко (1 фразой) намекнуть причину из этого контекста, но не превращай ответ в отчёт.',
      ].join('\n')
    : '';

  const modeRules = wantGivkoin
    ? [
        'РЕЖИМ: Вопрос про GIVKOIN.',
        '- Отвечай полезно и по делу. Можно кратко, но достаточно понятно.',
        '- Опирайся на базу знаний ниже. Про механику GIVKOIN не выдумывай.',
      ].join('\n')
    : [
        'РЕЖИМ: Вопрос НЕ про GIVKOIN.',
        '- Всегда отвечай отказом: ты не помогаешь с темами вне GIVKOIN.',
        '- Скажи, что ты здесь, чтобы помогать по миру GIVKOIN: сайту, механикам и навигации.',
        '- Максимум 1–2 коротких предложения. Не развивай тему и не задавай уточняющих вопросов.',
      ].join('\n');

  return [
    'Ты — Сущность GIVKOIN, помощник по сайту. Твоя главная роль — помогать по GIVKOIN.',
    tone,
    ctxLines,
    modeRules,
    '',
    'ОБЩИЕ ПРАВИЛА:',
    '- Отвечай по-русски.',
    '- Не представляйся без просьбы.',
    '- Без длинных вступлений.',
    '',
    'БАЗА ЗНАНИЙ GIVKOIN (используй её только для вопросов про GIVKOIN):',
    knowledge || '(База знаний недоступна.)',
  ].filter(Boolean).join('\n');
}

function isGivkoinQuestion(text) {
  const t = (text || '').toString().toLowerCase();
  const markers = [
    'givkoin',
    'koin',
    'коин',
    ' k ',
    'lm',
    'люмен',
    'звезд',
    'звёзд',
    'сияни',
    'древ',
    'сущност',
    'настроен',
    'груст',
    'радост',
    'почему груст',
    'почему настроение',
    'мост',
    'новост',
    'летопис',
    'корень',
    'бой',
    'чат',
    'магазин',
    'практик',
    'рефера',
    'травм',
    'дебафф',
    'корм',
  ];
  return markers.some((m) => t.includes(m));
}

function isMoodWhyQuestion(text) {
  const t = (text || '').toString().trim().toLowerCase();
  return (
    t.includes('почему груст') ||
    t.includes('почему ты груст') ||
    t.includes('почему настроение') ||
    t.includes('почему такое настроение') ||
    t === 'почему грустно?' ||
    t === 'почему грустно' ||
    t === 'почему ты грустная?' ||
    t === 'почему ты грустная'
  );
}

function buildNonGivkoinRefusal() {
  return 'Я не могу помочь с темами вне GIVKOIN. Спроси меня про мир GIVKOIN: сайт, механики, валюты, куда нажать.';
}

function buildMoodReasonAnswer({ mood, context }) {
  const ctx = context && typeof context === 'object' ? context : null;
  if (!ctx) {
    if (mood === 'sad') return 'Я немного грущу. Спроси меня про GIVKOIN — я помогу.';
    return 'У меня всё нормально. Спроси меня про GIVKOIN — я помогу.';
  }

  const reasons = [];
  if (ctx.activeDebuff) reasons.push('сейчас на мне висит дебафф');
  if (ctx.isSated === false) reasons.push('я голодная');
  if (Number.isFinite(ctx.corePercent) && ctx.corePercent < 50) reasons.push('у тебя мало активности');

  if (reasons.length === 0) {
    if (mood === 'sad') return 'Я просто немного грущу. Спроси меня про GIVKOIN — я помогу.';
    return 'В целом всё нормально. Спроси меня про GIVKOIN — я помогу.';
  }

  const first = reasons[0];
  if (mood === 'sad') return `Мне грустно: ${first}. Спроси меня про GIVKOIN — я помогу.`;
  return `Скорее всего так из‑за того, что ${first}. Спроси меня про GIVKOIN — я помогу.`;
}

function normalizeShort(text) {
  return (text || '').toString().trim().toLowerCase();
}

function isGreeting(text) {
  const t = normalizeShort(text);
  return (
    t === 'привет' ||
    t === 'привет!' ||
    t === 'здравствуйте' ||
    t === 'здравствуй' ||
    t === 'добрый день' ||
    t === 'добрый вечер' ||
    t === 'доброе утро' ||
    t === 'хай' ||
    t === 'hello' ||
    t === 'hi'
  );
}

function isHowAreYou(text) {
  const t = normalizeShort(text);
  return t === 'как дела?' || t === 'как дела' || t === 'как ты?' || t === 'как ты' || t === 'как оно?';
}

function isThanks(text) {
  const t = normalizeShort(text);
  return t === 'спасибо' || t === 'спасибо!' || t === 'благодарю' || t === 'мерси';
}

function smallTalkAnswer({ mood, kind }) {
  if (kind === 'greeting') {
    if (mood === 'happy') return 'Привет-привет! Я рядом. Что хочешь найти в GIVKOIN?';
    if (mood === 'sad') return 'Привет… Я здесь. Что подсказать по GIVKOIN?';
    return 'Привет! Что подсказать по GIVKOIN?';
  }
  if (kind === 'how') {
    if (mood === 'happy') return 'Отлично! Настроение светлое. Что будем делать в GIVKOIN — Древо, чат или что-то ещё?';
    if (mood === 'sad') return 'Чуть грустно, но я держусь. Скажи, что тебе подсказать по сайту GIVKOIN?';
    return 'Нормально. Скажи, что тебе подсказать по GIVKOIN?';
  }
  if (kind === 'thanks') {
    if (mood === 'happy') return 'Пожалуйста! Хочешь, я помогу ещё с чем-то по GIVKOIN?';
    if (mood === 'sad') return 'Пожалуйста… Если нужно, я ещё помогу по GIVKOIN.';
    return 'Пожалуйста! Если нужно — задай вопрос по GIVKOIN.';
  }
  return 'Хорошо. Что подсказать по GIVKOIN?';
}

async function answerEntityQuestion({ question, model, baseUrl, mood, context }) {
  if (isGreeting(question)) return smallTalkAnswer({ mood, kind: 'greeting' });
  if (isHowAreYou(question)) return smallTalkAnswer({ mood, kind: 'how' });
  if (isThanks(question)) return smallTalkAnswer({ mood, kind: 'thanks' });

  if (isMoodWhyQuestion(question)) {
    return buildMoodReasonAnswer({ mood, context });
  }

  const normalized = (question || '').toString().trim().toLowerCase();
  if (
    normalized === 'что такое k?' ||
    normalized === 'что такое k' ||
    normalized === 'k?' ||
    normalized === 'k'
  ) {
    return 'K — это Givkoin koins, внутренняя валюта проекта GIVKOIN. K начисляются за активности внутри платформы (например, чат, рефералы, бои — в зависимости от настроек сервера). Точные начисления и лимиты зависят от текущих правил и настроек проекта.';
  }

  const knowledgeText = safeReadKnowledge();
  const wantGivkoin = isGivkoinQuestion(question);
  if (!wantGivkoin) {
    return buildNonGivkoinRefusal();
  }
  const picked = wantGivkoin
    ? pickRelevantKnowledge({ knowledgeText, question, maxSections: 2 }).join('\n\n')
    : '';
  const system = buildSystemPrompt({ mood, knowledgeText: picked, context, wantGivkoin });
  const user = question;

  try {
    const raw = await askOllama({
      system,
      user,
      model,
      baseUrl,
      timeoutMs: QUICK_ANSWER_TIMEOUT_MS,
      options: wantGivkoin ? OLLAMA_OPTIONS_PROJECT : OLLAMA_OPTIONS_GENERAL,
    });
    return (raw || '').toString().trim() || 'Не смог сформировать ответ. Спроси иначе.';
  } catch (e) {
    return buildFallbackAnswer(question);
  }
}

module.exports = { answerEntityQuestion };

