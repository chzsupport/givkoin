const { getSetting } = require('../utils/settings');
const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const meditationRuntimeService = require('../services/meditationRuntimeService');

const COLLECTIVE_MEDITATION_KEY = 'COLLECTIVE_MEDITATION_SETTINGS';
const COLLECTIVE_MEDITATION_SCHEDULE_KEY = 'COLLECTIVE_MEDITATION_SCHEDULE';
const RESOLVE_COLLECTIVE_SESSIONS_CACHE_MAX_MS = 5000;

let collectiveSessionsCache = {
  expiresAt: 0,
  value: null,
};
let collectiveSessionsInFlight = null;

function getDefaultCollectiveSettings() {
  return {
    startTime: { hour: 0, minute: 0, second: 0 },
    phase1Min: 1,
    phase2Min: 1,
    rounds: 3,
    weText: '',
  };
}

function getDefaultSchedule() {
  return [];
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function generateId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSessionTranslations(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const translations = source.translations && typeof source.translations === 'object' ? source.translations : {};
  const en = translations.en && typeof translations.en === 'object' ? translations.en : {};

  return {
    ...translations,
    en: {
      ...en,
      weText: typeof en.weText === 'string' ? en.weText : '',
    },
  };
}

function normalizeStoredSettings(raw) {
  const base = getDefaultCollectiveSettings();
  const settings = { ...base, ...(raw || {}) };

  // Backward compatibility (старые поля)
  if (settings.startAt && !settings.startTime) {
    const d = new Date(Number(settings.startAt));
    settings.startTime = {
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
    };
  }
  if (settings.phase1Ms && !settings.phase1Min) {
    settings.phase1Min = Math.max(0, Number(settings.phase1Ms) / 60000);
  }
  if (settings.phase2Ms && !settings.phase2Min) {
    settings.phase2Min = Math.max(0, Number(settings.phase2Ms) / 60000);
  }

  settings.startTime = {
    hour: clampInt(settings.startTime?.hour, 0, 23, 0),
    minute: clampInt(settings.startTime?.minute, 0, 59, 0),
    second: clampInt(settings.startTime?.second, 0, 59, 0),
  };
  settings.phase1Min = Math.max(0, Number(settings.phase1Min) || 0);
  settings.phase2Min = Math.max(0, Number(settings.phase2Min) || 0);
  settings.rounds = Math.max(1, clampInt(settings.rounds, 1, 999, 3));
  settings.weText = typeof settings.weText === 'string' ? settings.weText : '';

  return settings;
}

function normalizeSession(raw) {
  const startsAt = Number(raw?.startsAt);
  const phase1Min = clampNumber(raw?.phase1Min, 0, 24 * 60, 1);
  const phase2Min = clampNumber(raw?.phase2Min, 0, 24 * 60, 1);
  const rounds = Math.max(1, clampInt(raw?.rounds, 1, 999, 3));
  const weText = typeof raw?.weText === 'string' ? raw.weText : '';
  const id = typeof raw?.id === 'string' && raw.id.trim() ? raw.id : generateId();
  const translations = normalizeSessionTranslations(raw);

  if (!Number.isFinite(startsAt)) return null;

  const durationMs = Math.round((phase1Min + phase2Min) * rounds * 60 * 1000);
  const endsAt = startsAt + Math.max(0, durationMs);

  return {
    id,
    startsAt,
    phase1Min,
    phase2Min,
    rounds,
    weText,
    translations,
    durationMs,
    endsAt,
  };
}

function normalizeSchedule(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = list
    .map(normalizeSession)
    .filter(Boolean)
    .sort((a, b) => a.startsAt - b.startsAt);
  return normalized;
}

function scheduleFromLegacySettings(serverNow, storedLegacy) {
  const legacy = normalizeStoredSettings(storedLegacy);
  const phase1Ms = Math.round(legacy.phase1Min * 60 * 1000);
  const phase2Ms = Math.round(legacy.phase2Min * 60 * 1000);
  const durationMs = (phase1Ms + phase2Ms) * legacy.rounds;
  const startAt = computeStartAtLocal(serverNow, legacy.startTime, durationMs);

  return normalizeSchedule([
    {
      id: 'legacy',
      startsAt: startAt,
      phase1Min: legacy.phase1Min,
      phase2Min: legacy.phase2Min,
      rounds: legacy.rounds,
      weText: legacy.weText,
    },
  ]);
}

function computeStartAtLocal(serverNow, startTime, durationMs) {
  const now = new Date(serverNow);
  const startAtToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    startTime.hour,
    startTime.minute,
    startTime.second,
    0
  ).getTime();

  if (serverNow < startAtToday) return startAtToday;

  const safeDuration = Math.max(0, Number(durationMs) || 0);
  const endAtToday = startAtToday + safeDuration;

  // Если медитация уже началась и ещё идёт — возвращаем старт сегодняшней сессии,
  // чтобы startAt не прыгал на "завтра" ровно в момент начала.
  if (serverNow < endAtToday) return startAtToday;

  return startAtToday + 24 * 60 * 60 * 1000;
}

function pickActiveAndNext(schedule, serverNow) {
  const active = schedule.find((s) => serverNow >= s.startsAt && serverNow < s.endsAt) || null;
  const next = schedule.find((s) => s.startsAt > serverNow) || null;
  return { activeSession: active, nextSession: next };
}

function getCollectiveSessionsCacheTtlMs(result, serverNow) {
  const boundaries = [
    Number(result?.activeSession?.endsAt) || 0,
    Number(result?.nextSession?.startsAt) || 0,
  ].filter((value) => Number.isFinite(value) && value > serverNow);

  if (!boundaries.length) {
    return RESOLVE_COLLECTIVE_SESSIONS_CACHE_MAX_MS;
  }

  return Math.max(
    250,
    Math.min(
      RESOLVE_COLLECTIVE_SESSIONS_CACHE_MAX_MS,
      Math.min(...boundaries) - serverNow
    )
  );
}

function toId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  try {
    return String(value);
  } catch (_e) {
    return null;
  }
}

async function getUsersByIds(ids) {
  const unique = Array.from(new Set((Array.isArray(ids) ? ids : []).map((v) => String(v || '').trim()).filter(Boolean)));
  const map = new Map();
  if (!unique.length) return map;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,nickname')
    .in('id', unique);

  if (error) throw error;
  for (const row of (Array.isArray(data) ? data : [])) {
    if (!row?.id) continue;
    map.set(String(row.id), row);
  }
  return map;
}

async function resolveCollectiveSessions(serverNow, { force = false } = {}) {
  if (!force && collectiveSessionsCache.value && collectiveSessionsCache.expiresAt > serverNow) {
    return collectiveSessionsCache.value;
  }

  if (!force && collectiveSessionsInFlight) {
    return collectiveSessionsInFlight;
  }

  collectiveSessionsInFlight = (async () => {
    const storedSchedule = await getSetting(COLLECTIVE_MEDITATION_SCHEDULE_KEY, getDefaultSchedule());
    let schedule = normalizeSchedule(storedSchedule);

    if (schedule.length === 0) {
      const storedLegacy = await getSetting(COLLECTIVE_MEDITATION_KEY, getDefaultCollectiveSettings());
      schedule = scheduleFromLegacySettings(serverNow, storedLegacy);
    }

    const runtimeSnapshots = await meditationRuntimeService.listSessionSnapshots();
    const activeSnapshot = runtimeSnapshots.find((row) => {
      const startsAt = Number(row.startsAt) || 0;
      const endsAt = Number(row.endsAt) || 0;
      return serverNow >= startsAt && serverNow < endsAt;
    }) || null;

    let result;
    if (activeSnapshot) {
      const nextSession = schedule.find((session) => session.startsAt > serverNow) || null;
      result = {
        activeSession: activeSnapshot,
        nextSession,
      };
    } else {
      const { activeSession, nextSession } = pickActiveAndNext(schedule, serverNow);
      if (activeSession) {
        const snapshot = await meditationRuntimeService.ensureSessionSnapshot(activeSession);
        result = {
          activeSession: snapshot || activeSession,
          nextSession,
        };
      } else {
        result = { activeSession: null, nextSession };
      }
    }

    collectiveSessionsCache = {
      value: result,
      expiresAt: serverNow + getCollectiveSessionsCacheTtlMs(result, serverNow),
    };
    return result;
  })();

  try {
    return await collectiveSessionsInFlight;
  } finally {
    collectiveSessionsInFlight = null;
  }
}

exports.getCollectiveMeditation = async (_req, res) => {
  try {
    const serverNow = Date.now();
    const { activeSession, nextSession } = await resolveCollectiveSessions(serverNow);
    const nowDate = new Date(serverNow);
    res.json({
      serverNow,
      serverNowIso: nowDate.toISOString(),
      serverTzOffsetMin: -nowDate.getTimezoneOffset(),
      activeSession,
      nextSession,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.optInCollectiveMeditation = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Некорректный sessionId' });
    }

    const serverNow = Date.now();
    const { nextSession } = await resolveCollectiveSessions(serverNow);
    if (!nextSession || String(nextSession.id) !== sessionId) {
      return res.status(400).json({ message: 'Сессия недоступна' });
    }

    await meditationRuntimeService.optInParticipant({
      session: nextSession,
      userId: req.user._id,
      now: new Date(serverNow),
    });

    return res.json({
      ok: true,
      sessionId,
      sessionTiming: {
        startsAt: Number(nextSession.startsAt) || serverNow,
        endsAt: Number(nextSession.endsAt) || serverNow,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.optOutCollectiveMeditation = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Некорректный sessionId' });
    }

    await meditationRuntimeService.optOutParticipant({
      sessionId,
      userId: req.user._id,
      now: new Date(),
    });

    return res.json({
      ok: true,
      sessionId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.joinCollectiveMeditation = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Некорректный sessionId' });
    }

    const serverNow = Date.now();
    const { activeSession } = await resolveCollectiveSessions(serverNow);
    if (!activeSession || String(activeSession.id) !== sessionId) {
      return res.status(400).json({ message: 'Сессия сейчас не активна' });
    }

    const participation = await meditationRuntimeService.joinCollectiveSession({
      session: activeSession,
      userId: req.user._id,
      now: new Date(serverNow),
    });

    return res.json({
      ok: true,
      sessionId,
      participation,
      sessionTiming: {
        startsAt: Number(activeSession.startsAt) || serverNow,
        endsAt: Number(activeSession.endsAt) || serverNow,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.finishCollectiveMeditation = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const reason = String(req.body?.reason || 'completed').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Некорректный sessionId' });
    }

    const participation = await meditationRuntimeService.finishCollectiveSession({
      sessionId,
      userId: req.user._id,
      reason,
      now: new Date(),
    });

    return res.json({
      ok: true,
      sessionId,
      participation,
    });
  } catch (error) {
    if (error.message === 'collective_not_joined') {
      return res.status(400).json({ message: 'Сначала нужно войти в медитацию' });
    }
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.recordCollectiveHeartbeat = async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Некорректный sessionId' });
    }

    await meditationRuntimeService.recordCollectiveHeartbeat({
      sessionId,
      userId: req.user._id,
      now: new Date(),
    });

    return res.json({
      ok: true,
      compatibility: true,
      sessionId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

exports.getCollectiveParticipants = async (req, res) => {
  try {
    const sessionId = String(req.query?.sessionId || req.params?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Некорректный sessionId' });
    }

    const rows = await meditationRuntimeService.listQueueParticipants(sessionId);
    const selfState = await meditationRuntimeService.getParticipantState(sessionId, req.user._id);

    const safeRows = Array.isArray(rows) ? rows : [];
    const userIds = Array.from(new Set(safeRows.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);

    const participants = safeRows
      .map((row) => {
        const id = toId(row?.user) || '';
        const u = id ? userMap.get(id) : null;
        const name = u?.nickname ? String(u.nickname) : '';
        if (!id || !name) return null;
        return { id, name };
      })
      .filter(Boolean);

    return res.json({
      ok: true,
      sessionId,
      total: participants.length,
      participants,
      selfQueued: Boolean(selfState?.queueEntry && !selfState.queueEntry.removedAt),
      selfJoined: Boolean(selfState?.participation),
      selfParticipation: selfState?.participation || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Server error' });
  }
};

module.exports = {
  getCollectiveMeditation: exports.getCollectiveMeditation,
  getCollectiveParticipants: exports.getCollectiveParticipants,
  finishCollectiveMeditation: exports.finishCollectiveMeditation,
  joinCollectiveMeditation: exports.joinCollectiveMeditation,
  optOutCollectiveMeditation: exports.optOutCollectiveMeditation,
  optInCollectiveMeditation: exports.optInCollectiveMeditation,
  recordCollectiveHeartbeat: exports.recordCollectiveHeartbeat,
  COLLECTIVE_MEDITATION_KEY,
  COLLECTIVE_MEDITATION_SCHEDULE_KEY,
  getDefaultCollectiveSettings,
  getDefaultSchedule,
  normalizeStoredSettings,
  normalizeSchedule,
  normalizeSession,
  pickActiveAndNext,
  scheduleFromLegacySettings,
};
